variable "use_vpc" {
  description = "If true, isolates resources in private subnets and uses VPC Endpoints (Costly). If false, runs in Zero-VPC mode via public endpoints and Data API."
  type        = bool
  default     = false
}

variable "multi_az" {
  description = "If true, deploys VPC Endpoints across all availability zones (High Availability). If false, restricts endpoints to a single AZ (Cost Optimized)."
  type        = bool
  default     = false
}
