terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }

  backend "s3" {
    bucket         = "aws-geocoding-terraform-state"
    key            = "aws-address-validation/terraform.tfstate"
    region         = "ap-southeast-2"
    dynamodb_table = "aws-geocoding-terraform-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = "ap-southeast-2"

  default_tags {
    tags = {
      Project     = "AWS Address Validation"
      Environment = "POC"
      ManagedBy   = "Terraform"
    }
  }
}
