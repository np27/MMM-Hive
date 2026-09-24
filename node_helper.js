'use strict';

/* Magic Mirror
 * Module: MMM-Hive
 *
 * Updated authentication/API implementation.
 * Original module by Stuart McNally.
 */

const NodeHelper = require('node_helper');
const {
    HiveAuth,
    HiveSmsRequired
} = require('./hive-auth');

const HIVE_NODES_URL =
    'https://beekeeper.hivehome.com/1.0/nodes/all' +
    '?products=true&devices=true&actions=true';

const POSTCODE_API_BASE =
    'https://api.postcodes.io/postcodes/';

const OPEN_METEO_URL =
    'https://api.open-meteo.com/v1/forecast';

module.exports = NodeHelper.create({

    start: function () {
        console.log(`Starting node helper for: ${this.name}`);

        this.config = null;
        this.hiveAuth = null;

        this.running = false;
        this.timer = null;

        this.postcodeCoordinates = null;
        this.postcode = null;
    },

    stop: function () {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    },

    socketNotificationReceived: function (notification, payload) {
        if (notification === 'CONFIG') {
            this.config = payload;

            this.hiveAuth = new HiveAuth(
                this.config.username,
                this.config.password,
                {
                    smsCode: this.config.smsCode || null,
                    logger: {
                        log: (...args) => console.log('[MMM-Hive]', ...args),
                        error: (...args) => console.error('[MMM-Hive]', ...args)
                    }
                }
            );

            this.postcodeCoordinates = null;
            this.postcode = null;

            return;
        }

        if (notification === 'DATA' && this.config !== null) {
            this.getData();
        }
    },

    getData: async function () {
        if (this.running) {
            return;
        }

        this.running = true;

        try {
            if (!this.config) {
                throw new Error('MMM-Hive configuration has not been received.');
            }

            if (!this.config.username || !this.config.password) {
                const error = new Error(
                    'Hive username/password are missing from config.js'
                );

                error.code = 'AUTH';

                throw error;
            }

            const [hiveData, outsideTemperature] = await Promise.all([
                this.getHiveData(),
                this.getOutsideTemperature()
            ]);

            this.sendSocketNotification(
                'INSIDE',
                JSON.stringify(hiveData.inside)
            );

            this.sendSocketNotification(
                'DEVICES',
                JSON.stringify(hiveData.devices)
            );

            this.sendSocketNotification(
                'OUTSIDE',
                JSON.stringify({
                    weather: {
                        temperature: {
                            value: outsideTemperature
                        }
                    }
                })
            );

        } catch (error) {
            console.error(
                '[MMM-Hive] Data update failed:',
                error && error.message ? error.message : error
            );

            if (error && error.code === 'AUTH') {
                this.sendSocketNotification(
                    '401_ERROR',
                    error.message
                );
            } else if (error && error.name === 'HiveSmsRequired') {
                this.sendSocketNotification(
                    '401_ERROR',
                    'Hive requires SMS/MFA verification.'
                );
            } else if (error && error.source === 'outside') {
                if (error.code === 'POSTCODE') {
                    this.sendSocketNotification(
                        'POSTCODE_ERROR',
                        error.message
                    );
                } else {
                    this.sendSocketNotification(
                        'OUTSIDE_ERROR',
                        error.message
                    );
                }
            } else {
                this.sendSocketNotification(
                    'INSIDE_ERROR',
                    error && error.message
                        ? error.message
                        : String(error)
                );
            }

        } finally {
            this.running = false;
            this.scheduleNextUpdate();
        }
    },

    scheduleNextUpdate: function () {
        if (this.timer) {
            clearTimeout(this.timer);
        }

        const interval = Number(this.config?.updateInterval) || 600000;

        this.timer = setTimeout(
            () => this.getData(),
            Math.max(interval, 30000)
        );
    },

    getHiveData: async function () {
        let tokens;

        try {
            tokens = await this.hiveAuth.getValidTokens();
        } catch (error) {
            if (error instanceof HiveSmsRequired) {
                throw error;
            }

            const authError = new Error(
                error && error.message
                    ? error.message
                    : 'Hive authentication failed.'
            );

            authError.code = 'AUTH';

            throw authError;
        }

        try {
            return await this.requestHiveData(tokens.idToken);
        } catch (error) {
            if (error.status !== 401) {
                throw error;
            }

            /*
             * Hive rejected the current ID token.
             * Discard it and perform a fresh Cognito login.
             */

            console.log(
                '[MMM-Hive] Hive returned 401. Re-authenticating.'
            );

            this.hiveAuth.invalidate();

            try {
                tokens = await this.hiveAuth.getValidTokens();

                return await this.requestHiveData(tokens.idToken);
            } catch (retryError) {
                if (retryError instanceof HiveSmsRequired) {
                    throw retryError;
                }

                const authError = new Error(
                    retryError && retryError.message
                        ? retryError.message
                        : 'Hive re-authentication failed.'
                );

                authError.code = 'AUTH';

                throw authError;
            }
        }
    },

    requestHiveData: async function (idToken) {
        const response = await fetch(
            HIVE_NODES_URL,
            {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Authorization': idToken,
                    'User-Agent':
                        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
                        'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
                }
            }
        );

        const body = await response.text();

        if (!response.ok) {
            const error = new Error(
                `Hive API returned HTTP ${response.status}: ${body.slice(0, 300)}`
            );

            error.status = response.status;

            throw error;
        }

        let data;

        try {
            data = JSON.parse(body);
        } catch (error) {
            throw new Error(
                'Hive API returned invalid JSON.'
            );
        }

        return this.normaliseHiveData(data);
    },

    normaliseHiveData: function (data) {
        const products = Array.isArray(data.products)
            ? data.products
            : [];

        const devices = Array.isArray(data.devices)
            ? data.devices
            : [];

        /*
         * Find the heating product.
         *
         * nodeName normally remains "heating", but matching the
         * product's displayed name as well makes multi-zone setups
         * easier to configure.
         */

        const requestedNode = this.config.nodeName || 'heating';

        let heatingProduct = products.find(
            product =>
                product.type === requestedNode ||
                product.state?.name === requestedNode
        );

        /*
         * Keep the original module's normal configuration working:
         * nodeName = "heating" means select the heating product.
         */

        if (!heatingProduct && requestedNode === 'heating') {
            heatingProduct = products.find(
                product => product.type === 'heating'
            );
        }

        if (!heatingProduct) {
            throw new Error(
                `No Hive heating product found for nodeName "${requestedNode}".`
            );
        }

        const temperature =
            heatingProduct.props?.temperature ?? null;

        const target =
            heatingProduct.state?.target ?? null;

        const working =
            heatingProduct.props?.working === true;

        /*
         * The original MMM-Hive front end expects:
         *
         * type
         * props.temperature
         * state.status
         * state.boost
         * state.target
         */

        const inside = [
            {
                id: heatingProduct.id,
                type: 'heating',
                props: {
                    temperature
                },
                state: {
                    status: working ? 'ON' : 'OFF',
                    boost: this.config.hBoostOffText || 'Not Active',
                    target
                }
            }
        ];

        /*
         * Preserve hot-water support if Hive exposes one.
         *
         * Your current account has no hot-water product, so this
         * array will currently contain zero hot-water entries.
         */

        for (const product of products) {
            if (
                product.type !== 'hotwater' &&
                product.type !== 'hotwatercontrol'
            ) {
                continue;
            }

            inside.push({
                id: product.id,
                type: 'hotwater',
                props: {
                    working: product.props?.working === true
                },
                state: {
                    status:
                        product.props?.working === true
                            ? 'ON'
                            : 'OFF',
                    boost:
                        product.state?.boost ||
                        this.config.hwBoostOffText ||
                        'Off'
                }
            });
        }

        /*
         * Return the modern thermostat/device information using the
         * same notification expected by the existing front end.
         */

        return {
            inside,
            devices
        };
    },

    getOutsideTemperature: async function () {
        const sourceError = message => {
            const error = new Error(message);
            error.source = 'outside';
            return error;
        };

        const postcode = String(
            this.config.postcode || ''
        )
            .trim()
            .replace(/\s+/g, '');

        if (!postcode) {
            const error = sourceError(
                'Postcode is missing from MMM-Hive config.js'
            );

            error.code = 'POSTCODE';

            throw error;
        }

        let coordinates = this.postcodeCoordinates;

        /*
         * Only geocode the postcode again when it changes.
         */

        if (!coordinates || this.postcode !== postcode) {
            const url =
                POSTCODE_API_BASE +
                encodeURIComponent(postcode);

            const response = await fetch(url, {
                headers: {
                    Accept: 'application/json'
                }
            });

            if (response.status === 404) {
                const error = sourceError(
                    `Postcode "${postcode}" was not found.`
                );

                error.code = 'POSTCODE';

                throw error;
            }

            if (!response.ok) {
                throw sourceError(
                    `Postcodes.io returned HTTP ${response.status}.`
                );
            }

            const data = await response.json();

            if (!data.result ||
                typeof data.result.latitude !== 'number' ||
                typeof data.result.longitude !== 'number') {
                const error = sourceError(
                    'Postcodes.io returned no usable coordinates.'
                );

                error.code = 'POSTCODE';

                throw error;
            }

            coordinates = {
                latitude: data.result.latitude,
                longitude: data.result.longitude
            };

            this.postcodeCoordinates = coordinates;
            this.postcode = postcode;
        }

        const url = new URL(OPEN_METEO_URL);

        url.searchParams.set(
            'latitude',
            coordinates.latitude
        );

        url.searchParams.set(
            'longitude',
            coordinates.longitude
        );

        url.searchParams.set(
            'current',
            'temperature_2m'
        );

        url.searchParams.set(
            'temperature_unit',
            'celsius'
        );

        url.searchParams.set(
            'timezone',
            'Europe/London'
        );

        const response = await fetch(url);

        if (!response.ok) {
            throw sourceError(
                `Open-Meteo returned HTTP ${response.status}.`
            );
        }

        const data = await response.json();

        const temperature =
            data.current?.temperature_2m;

        if (typeof temperature !== 'number') {
            throw sourceError(
                'Open-Meteo returned no current temperature.'
            );
        }

        return temperature;
    }

});
