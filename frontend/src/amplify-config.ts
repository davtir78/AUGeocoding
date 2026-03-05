import { Amplify } from 'aws-amplify';
import type { ResourcesConfig } from '@aws-amplify/core';
import config from './amplifyconfiguration.json';

// Explicitly type and transform the config for Amplify v6
const amplifyConfig: ResourcesConfig = {
    Auth: {
        Cognito: {
            userPoolId: config.aws_user_pools_id,
            userPoolClientId: config.aws_user_pools_web_client_id,
            identityPoolId: config.aws_cognito_identity_pool_id,
            loginWith: {
                email: true,
            },
            signUpVerificationMethod: 'code',
            userAttributes: {
                email: {
                    required: true,
                },
            },
            allowGuestAccess: true
        }
    },
    API: {
        REST: {
            'GeocodingAPI': {
                endpoint: config.API.REST.GeocodingAPI.endpoint,
                region: config.aws_project_region
            }
        }
    },
    Geo: {
        LocationService: {
            maps: {
                items: {
                    [config.geo.amazon_location_service.maps.default]: {
                        style: 'VectorEsriStreets'
                    }
                },
                default: config.geo.amazon_location_service.maps.default
            },
            region: config.geo.amazon_location_service.region,
        }
    }
};

console.log('Initializing Amplify with:', amplifyConfig);
Amplify.configure(amplifyConfig);

export { Amplify };
export * from '@aws-amplify/ui-react';
