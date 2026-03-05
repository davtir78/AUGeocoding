const fs = require('fs');
const path = require('path');

const apiEndpoint = process.env.CLOUDFRONT_URL || process.env.API_ENDPOINT;
const region = process.env.REGION || 'ap-southeast-2';
const mapName = process.env.MAP_NAME || 'aws-geocoding-map';

const userPoolId = process.env.USER_POOL_ID;
const userPoolClientId = process.env.USER_POOL_CLIENT_ID;
const identityPoolId = process.env.IDENTITY_POOL_ID;

if (!apiEndpoint) {
    console.error("Error: API_ENDPOINT environment variable is missing.");
    process.exit(1);
}

const config = {
    "aws_project_region": region,
    "aws_cognito_identity_pool_id": identityPoolId,
    "aws_cognito_region": region,
    "aws_user_pools_id": userPoolId,
    "aws_user_pools_web_client_id": userPoolClientId,
    "aws_cognito_username_attributes": ["EMAIL"],
    "aws_cognito_social_providers": [],
    "aws_cognito_signup_attributes": ["EMAIL", "NAME"],
    "aws_cognito_mfa_configuration": "OFF",
    "aws_cognito_mfa_types": [],
    "aws_cognito_password_protection_settings": {
        "passwordPolicyMinLength": 8,
        "passwordPolicyCharacters": [
            "REQUIRES_LOWERCASE",
            "REQUIRES_NUMBERS",
            "REQUIRES_UPPERCASE"
        ]
    },
    "aws_cognito_verification_mechanisms": [
        "EMAIL"
    ],
    "API": {
        "GraphQL": {
            "endpoint": "",
            "region": region,
            "defaultAuthentication": {
                "authenticationType": "API_KEY",
                "apiKey": ""
            }
        },
        "REST": {
            "GeocodingAPI": {
                "endpoint": apiEndpoint,
                "region": region
            }
        }
    },
    "geo": {
        "amazon_location_service": {
            "region": region,
            "maps": {
                "items": {
                    [mapName]: {
                        "style": "VectorEsriStreets"
                    }
                },
                "default": mapName
            }
        }
    }
};

const outputPath = path.join(__dirname, '../frontend/src/amplifyconfiguration.json');
fs.writeFileSync(outputPath, JSON.stringify(config, null, 4));
console.log(`Generated ${outputPath}`);
