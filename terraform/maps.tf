# AWS Location Service Map Resource
resource "aws_location_map" "main" {
  configuration {
    style = "VectorEsriStreets" # Premium look for professional GIS
  }
  map_name    = "aws-geocoding-map"
  description = "Map for professional address validation and visualization"
}

# IAM Policy for Public/Authenticated access via Cognito
resource "aws_iam_policy" "map_access" {
  name        = "aws-geocoding-map-access"
  path        = "/"
  description = "Provides read-only access to the geocoding map"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "geo:GetMapStyleDescriptor",
          "geo:GetMapGlyphs",
          "geo:GetMapSprites",
          "geo:GetMapTile"
        ]
        Effect   = "Allow"
        Resource = aws_location_map.main.map_arn
      }
    ]
  })
}

output "map_name" {
  value = aws_location_map.main.map_name
}

output "map_arn" {
  value = aws_location_map.main.map_arn
}
