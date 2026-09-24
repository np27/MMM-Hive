'use strict';

const {
    CognitoUserPool,
    CognitoUser,
    AuthenticationDetails
} = require('amazon-cognito-identity-js');

const HIVE_SSO_URL = 'https://sso.hivehome.com/';

class HiveSmsRequired extends Error {
    constructor() {
        super('Hive login requires an SMS MFA code.');
        this.name = 'HiveSmsRequired';
    }
}

class HiveAuth {
    constructor(username, password, options = {}) {
        this.username = username;
        this.password = password;
        this.smsCode = options.smsCode || null;
        this.logger = options.logger || console;

        this.poolConfig = null;
        this.userPool = null;
        this.cognitoUser = null;
        this.tokens = null;
    }

    async discoverPool() {
        if (this.poolConfig) {
            return this.poolConfig;
        }

        const response = await fetch(HIVE_SSO_URL, {
            headers: {
                'User-Agent':
                    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
                    'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
            }
        });

        if (!response.ok) {
            throw new Error(
                `Failed to fetch Hive SSO configuration: HTTP ${response.status}`
            );
        }

        const html = await response.text();

        const poolMatch = html.match(
            /HiveSSOPoolId\s*=\s*["']([^"']+)["']/
        );

        const clientMatch = html.match(
            /HiveSSOPublicCognitoClientId\s*=\s*["']([^"']+)["']/
        );

        if (!poolMatch || !clientMatch) {
            throw new Error(
                'Could not find Hive Cognito pool/client IDs on the SSO page.'
            );
        }

        this.poolConfig = {
            poolId: poolMatch[1],
            clientId: clientMatch[1]
        };

        this.logger.log(
            `Hive Cognito pool discovered: ${this.poolConfig.poolId}`
        );

        return this.poolConfig;
    }

    async ensureUserPool() {
        if (this.userPool) {
            return this.userPool;
        }

        const config = await this.discoverPool();

        this.userPool = new CognitoUserPool({
            UserPoolId: config.poolId,
            ClientId: config.clientId
        });

        return this.userPool;
    }

    async login() {
        const pool = await this.ensureUserPool();

        this.cognitoUser = new CognitoUser({
            Username: this.username,
            Pool: pool
        });

        const authenticationDetails = new AuthenticationDetails({
            Username: this.username,
            Password: this.password
        });

        const session = await new Promise((resolve, reject) => {
            this.cognitoUser.authenticateUser(authenticationDetails, {
                onSuccess: resolve,

                onFailure: reject,

                mfaRequired: () => {
                    if (!this.smsCode) {
                        reject(new HiveSmsRequired());
                        return;
                    }

                    this.cognitoUser.sendMFACode(
                        String(this.smsCode).trim(),
                        {
                            onSuccess: resolve,
                            onFailure: reject
                        },
                        'SMS_MFA'
                    );
                },

                totpRequired: () => {
                    reject(
                        new Error(
                            'Hive requested TOTP MFA. This module currently supports SMS MFA only.'
                        )
                    );
                },

                selectMFAType: () => {
                    reject(
                        new Error(
                            'Hive requested MFA method selection. Set SMS as the default MFA method in Hive.'
                        )
                    );
                },

                newPasswordRequired: () => {
                    reject(
                        new Error(
                            'Hive requires a new password. Complete the password change through Hive first.'
                        )
                    );
                },

                mfaSetup: () => {
                    reject(
                        new Error(
                            'Hive requires MFA setup. Complete this through Hive first.'
                        )
                    );
                },

                customChallenge: () => {
                    reject(
                        new Error(
                            'Hive returned an unsupported custom authentication challenge.'
                        )
                    );
                }
            });
        });

        this.tokens = {
            idToken: session.getIdToken().getJwtToken(),
            accessToken: session.getAccessToken().getJwtToken(),
            expiresAt: session.getIdToken().getExpiration() * 1000
        };

        this.logger.log(
            `Hive authentication successful. Token expires at ${new Date(
                this.tokens.expiresAt
            ).toISOString()}`
        );

        return this.tokens;
    }

    async getValidTokens() {
        if (this.tokens) {
            return this.tokens;
        }

        this.logger.log('No active Hive session. Authenticating.');

        return this.login();
    }

    invalidate() {
        this.tokens = null;
    }
}

module.exports = {
    HiveAuth,
    HiveSmsRequired
};
