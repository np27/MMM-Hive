# MMM-Hive

A module for the [MagicMirror² project](https://github.com/MichMich/MagicMirror) to display inside / outside temperature from your Hive heating system.

This repository is a modernised fork of [flick116/MMM-Hive](https://github.com/flick116/MMM-Hive).

## Modernised fork

The original MMM-Hive module stopped working after Hive changed its authentication and API infrastructure.

This fork updates the authentication and API access while retaining the original MMM-Hive display, styling and general configuration approach.

### What has been modernised

* Uses Hive's current Cognito authentication flow through `amazon-cognito-identity-js`.
* Dynamically discovers the current Hive Cognito pool and public client from `https://sso.hivehome.com/`.
* Uses Hive's current Beekeeper API.
* Automatically performs a new Hive login if the active session is rejected with HTTP 401.
* Supports the current Hive heating product structure.
* Supports thermostat battery information.
* Retains the original MMM-Hive display and styling.
* Replaces the obsolete British Gas weather service with Postcodes.io and Open-Meteo for outside temperature.
* Does not store Hive access or refresh tokens in the repository.
* Removes the obsolete custom SRP authentication implementation used by the original module.

### Current tested environment

The modernised version has been tested successfully on:

* Raspberry Pi 4 Model B
* Debian Linux
* MagicMirror² 2.33.0
* Node.js 22
* Current Hive Cognito authentication
* Current Hive Beekeeper API

The module has been tested retrieving:

* Heating zone temperature
* Target temperature
* Heating operating state
* Thermostat battery level
* Outside temperature

## Display

Text and the inside icon are configurable, and the thermometer icon is dynamic based on the temperature values set in the config file.

![](images/hive1.png)

![](images/hive2.png)

With configuration changes to the text and icon:

![](images/hive3.png)

![](images/hive4.png)

Target Temperature will change when the inside temperature is equal to / less than 1 °C. The original module used this to identify Frost Protect mode, as Hive does not provide a simple on/off value for this state.

![](images/hive5.png)

## Installation

Clone this repository into your MagicMirror modules directory:

```bash
cd ~/MagicMirror/modules
git clone https://github.com/np27/MMM-Hive.git
cd MMM-Hive
npm install
```

### Important

The installation instructions from the original `flick116/MMM-Hive` project are no longer applicable to this fork.

Do **not**:

* Install `amazon-user-pool-srp-client`
* Copy the old `tokenGeneration/index.js`
* Disable Hive 2FA
* Create or use `HiveTokens.json`
* Hard-code the old Hive Cognito pool or client IDs

The modernised fork handles Hive authentication directly through the current Cognito service.

## Configuration

Add the module to `config/config.js`.

Example:

```javascript
{
    module: "MMM-Hive",
    header: "Hive Heating",
    classes: "xsmall",
    position: "bottom_left",
    config: {
        username: "your-hive-email@example.com",
        password: "your-hive-password",
        postcode: "LE44ED",
        showNext: true,
        showBattery: true,
        batteryIcon: true
    }
},
```

Do not publish your MagicMirror `config.js` if it contains your Hive username and password.

## Configuration options

| Option              | Default               | Description                                                     |
| ------------------- | --------------------- | --------------------------------------------------------------- |
| `username`          | `''`                  | Your Hive account email address.                                |
| `password`          | `''`                  | Your Hive account password.                                     |
| `postcode`          | `''`                  | UK postcode used to obtain the outside temperature.             |
| `updateInterval`    | `600000`              | Time between data updates in milliseconds.                      |
| `initialLoadDelay`  | `0`                   | Retained for compatibility with the original module.            |
| `showNext`          | `true`                | Display the target temperature.                                 |
| `showHotWater`      | `false`               | Display hot water status when available from Hive.              |
| `showBattery`       | `false`               | Display the thermostat battery percentage.                      |
| `batteryIcon`       | `false`               | Display the thermostat battery icon.                            |
| `insideText`        | `Inside:`             | Label for the inside temperature.                               |
| `outsideText`       | `Outside:`            | Label for the outside temperature.                              |
| `targetTempText`    | `Target Temperature:` | Label for the target temperature.                               |
| `hotWaterText`      | `Hot Water:`          | Label for hot water status.                                     |
| `thermBattText`     | `Thermostat Battery:` | Label for battery percentage.                                   |
| `insideIconSet`     | `fa fa-home`          | Font Awesome icon displayed beside the heating temperature.     |
| `hBoostOffText`     | `Not Active`          | Text used when heating boost is not active.                     |
| `hwBoostOffText`    | `Off`                 | Text used when hot water boost is not active.                   |
| `boostRow`          | `false`               | Retained for compatibility with the original module.            |
| `highestTemp`       | `30`                  | Temperature at which the full thermometer icon is displayed.    |
| `highTemp`          | `25`                  | Temperature threshold for the three-quarter thermometer icon.   |
| `lowTemp`           | `20`                  | Temperature threshold for the half thermometer icon.            |
| `lowestTemp`        | `15`                  | Temperature threshold for the quarter thermometer icon.         |
| `animatedLoading`   | `true`                | Display the animated loading icon while the module is starting. |
| `temperatureSuffix` | `°C`                  | Temperature suffix.                                             |
| `nodeName`          | `heating`             | Heating product to display. Useful for multi-zone systems.      |
| `debug`             | `false`               | Enable additional module logging.                               |
| `smsCode`           | `''`                  | Optional SMS MFA code if Hive requests SMS verification.        |

## Multi-zone heating

For a Hive system with multiple heating zones, `nodeName` can be set to the required zone name.

For example:

```javascript
nodeName: "Zone 1",
```

The module will use the corresponding Hive heating product.

## Authentication

The modernised fork uses Hive's current Cognito authentication process through `amazon-cognito-identity-js`.

The current Cognito pool and public client are discovered dynamically from Hive's SSO service rather than being hard-coded in the module.

The active Cognito session is held in memory while MagicMirror is running. Hive access and refresh tokens are not stored by the module.

If Hive rejects the active session with HTTP 401, MMM-Hive automatically performs a new login and retries the API request.

Your Hive username and password therefore need to be available through the module configuration in `config.js`.

### SMS MFA

If Hive requires SMS verification, the module supports an SMS code through the `smsCode` configuration option.

For example:

```javascript
smsCode: "123456",
```

Only use this when required by your Hive account.

## Hive API

The modernised module uses Hive's current Beekeeper API rather than the older `/products`, `/devices` and `/cognito/refresh-token` approach used by the original module.

The current API provides the heating product information used by the module, including:

* Current temperature
* Target temperature
* Operating mode
* Heating activity
* Thermostat device information
* Battery level

## Outside temperature

The original module used a British Gas weather endpoint.

That service is no longer used by this fork.

Instead, the module:

1. Sends the configured UK postcode to [Postcodes.io](https://postcodes.io/) to obtain latitude and longitude.
2. Uses [Open-Meteo](https://open-meteo.com/) to obtain the current outside temperature.

No weather API key is required.

## Updating an existing installation

The module is installed from this fork:

```text
https://github.com/np27/MMM-Hive
```

To update an existing installation:

```bash
cd ~/MagicMirror/modules/MMM-Hive
git pull --ff-only
npm install
pm2 restart mm
```

If your MagicMirror PM2 process has a different name, use that process name instead of `mm`.

To check the current Git status:

```bash
cd ~/MagicMirror/modules/MMM-Hive
git status
```

To check which branch and remote the installation is using:

```bash
git branch -vv
git remote -v
```

The normal production branch for this fork is `master`.

## GitHub fork structure

This repository is a fork of:

```text
https://github.com/flick116/MMM-Hive
```

The fork is maintained at:

```text
https://github.com/np27/MMM-Hive
```

During development, the Git remotes are configured as:

```text
origin   https://github.com/np27/MMM-Hive
upstream https://github.com/flick116/MMM-Hive.git
```

`origin` points to this modernised fork.

`upstream` points to the original MMM-Hive repository.

The `hive-auth-modernisation` branch was used during development and has been merged into `master`.

## Development

The modernisation was developed in the `hive-auth-modernisation` branch and tested directly on a Raspberry Pi running MagicMirror².

The working changes were then merged into `master`.

The development branch is retained in the repository for reference.

## Original project

This repository is based on the original MMM-Hive project by Stuart McNally.

The original project provided the MagicMirror display, styling and configuration structure. This fork focuses on updating the Hive authentication and API integration required to keep the module working with the current Hive service.

## Dependencies

The module uses:

* [amazon-cognito-identity-js](https://www.npmjs.com/package/amazon-cognito-identity-js)

Outside temperature data is obtained from:

* [Postcodes.io](https://postcodes.io/)
* [Open-Meteo](https://open-meteo.com/)

## A massive thanks to the following

* [Stuart McNally](https://github.com/flick116/) for creating MMM-Hive.
* [Graham White](https://github.com/grahamwhiteuk/) for the [bg-hive-api-v6](https://github.com/grahamwhiteuk/bg-hive-api-v6) API, which the original project used as a reference.
* [Michael Teeuw](https://github.com/MichMich) for the awesome [MagicMirror²](https://github.com/MichMich/MagicMirror/) project.
* [James Saunders](http://www.smartofthehome.com/2016/05/hive-rest-api-v6/) for the detailed breakdown of the Hive API.
* [Stefan](https://forum.magicmirror.builders/user/yawns) for the MagicMirror forum post that helped with working out how to retrieve the required JSON values.

## Licence

MIT License

Copyright (c) Stuart McNally and contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
