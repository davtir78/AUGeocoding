data "aws_region" "current" {}

# =============================================================================
# Authentication: AWS Cognito User Pool
# =============================================================================
#
# EXTENDING TO MICROSOFT ENTRA ID (Azure AD) / SAML FEDERATION:
# ---------------------------------------------------------------
# This User Pool is federation-ready. To add Entra ID as an identity provider:
#
# 1. In Entra ID:
#    - Register a new Enterprise Application (SAML)
#    - Set the Entity ID to: "urn:amazon:cognito:sp:<user_pool_id>"
#    - Set the Reply URL to:
#      "https://<your-domain>.auth.<region>.amazoncognito.com/saml2/idpresponse"
#    - Download the Federation Metadata XML
#
# 2. Add a Cognito SAML Identity Provider (uncomment below):
#    resource "aws_cognito_identity_provider" "entra_id" {
#      user_pool_id  = aws_cognito_user_pool.user_pool.id
#      provider_name = "EntraID"
#      provider_type = "SAML"
#
#      provider_details = {
#        MetadataURL            = "https://login.microsoftonline.com/<tenant-id>/federationmetadata/2007-06/federationmetadata.xml"
#        SLORedirectBindingURI  = "https://login.microsoftonline.com/<tenant-id>/saml2"
#        SSORedirectBindingURI  = "https://login.microsoftonline.com/<tenant-id>/saml2"
#      }
#
#      attribute_mapping = {
#        email = "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"
#        name  = "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name"
#      }
#    }
#
# 3. Update the User Pool Client to include the new provider:
#    supported_identity_providers = ["COGNITO", "EntraID"]
#
# 4. (Optional) Add a Cognito Domain for the Hosted UI:
#    resource "aws_cognito_user_pool_domain" "main" {
#      domain       = "au-geocoding"
#      user_pool_id = aws_cognito_user_pool.user_pool.id
#    }
#
# The JWT authorizer on API Gateway does NOT need any changes — it validates
# tokens from Cognito regardless of the upstream identity provider.
# =============================================================================

# Cognito User Pool
resource "aws_cognito_user_pool" "user_pool" {
  name = "aws-geocoding-user-pool"

  auto_verified_attributes = ["email"]
  mfa_configuration        = "OPTIONAL"

  software_token_mfa_configuration {
    enabled = true
  }

  schema {
    name                = "email"
    attribute_data_type = "String"
    required            = true
    mutable             = true
  }

  schema {
    name                = "name"
    attribute_data_type = "String"
    required            = true
    mutable             = true
  }

  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_numbers   = true
    require_symbols   = false
    require_uppercase = true
  }

  admin_create_user_config {
    allow_admin_create_user_only = true # Gov use: admin provisions users via CLI/console
  }

  lifecycle {
    ignore_changes = [
      schema,
    ]
  }
}

# Cognito User Pool Client
resource "aws_cognito_user_pool_client" "user_pool_client" {
  name            = "aws-geocoding-client"
  user_pool_id    = aws_cognito_user_pool.user_pool.id
  generate_secret = false # For web apps
  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH"
  ]

  # OAuth settings (optional but good for future proofing)
  # To add Entra ID federation, change this to: ["COGNITO", "EntraID"]
  supported_identity_providers         = ["COGNITO"]
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["email", "openid", "profile"]
  allowed_oauth_flows_user_pool_client = true

  callback_urls = ["http://localhost:5173/", "https://your-production-domain.com/"]
  logout_urls   = ["http://localhost:5173/", "https://your-production-domain.com/"]

  # Token lifetimes — ISM-aligned for government use
  access_token_validity  = 15 # minutes
  id_token_validity      = 15 # minutes
  refresh_token_validity = 8  # hours

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "hours"
  }

  # Enable refresh token rotation — each refresh invalidates the old token
  enable_token_revocation       = true
  prevent_user_existence_errors = "ENABLED"
}

resource "aws_cognito_identity_pool" "identity_pool" {
  identity_pool_name               = "aws-geocoding-identity-pool"
  allow_unauthenticated_identities = false # Restricted to authenticated users only for production
  allow_classic_flow               = false

  cognito_identity_providers {
    client_id               = aws_cognito_user_pool_client.user_pool_client.id
    provider_name           = aws_cognito_user_pool.user_pool.endpoint
    server_side_token_check = false
  }
}

# Identity Pool Roles
resource "aws_iam_role" "authenticated_role" {
  name = "aws-geocoding-authenticated-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = "cognito-identity.amazonaws.com"
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "cognito-identity.amazonaws.com:aud" = aws_cognito_identity_pool.identity_pool.id
          }
          "ForAnyValue:StringLike" = {
            "cognito-identity.amazonaws.com:amr" = "authenticated"
          }
        }
      }
    ]
  })
}

resource "aws_iam_role" "unauthenticated_role" {
  name = "aws-geocoding-unauthenticated-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = "cognito-identity.amazonaws.com"
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "cognito-identity.amazonaws.com:aud" = aws_cognito_identity_pool.identity_pool.id
          }
          "ForAnyValue:StringLike" = {
            "cognito-identity.amazonaws.com:amr" = "unauthenticated"
          }
        }
      }
    ]
  })
}

resource "aws_cognito_identity_pool_roles_attachment" "identity_pool_roles" {
  identity_pool_id = aws_cognito_identity_pool.identity_pool.id

  roles = {
    "authenticated"   = aws_iam_role.authenticated_role.arn
    "unauthenticated" = aws_iam_role.unauthenticated_role.arn
  }
}

# Attach Map Access Policy to Roles
resource "aws_iam_role_policy_attachment" "auth_map_access" {
  role       = aws_iam_role.authenticated_role.name
  policy_arn = aws_iam_policy.map_access.arn
}

resource "aws_iam_role_policy_attachment" "unauth_map_access" {
  role       = aws_iam_role.unauthenticated_role.name
  policy_arn = aws_iam_policy.map_access.arn
}
