# ICP Refinement Engine - Terraform Configuration
# Deploys Lambda function, EventBridge schedule, and IAM roles

terraform {
  required_version = ">= 1.0"
  
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# Variables
variable "aws_region" {
  description = "AWS region for deployment"
  type        = string
  default     = "us-east-1"
}

variable "function_name" {
  description = "Lambda function name"
  type        = string
  default     = "icp-refinement-engine"
}

variable "knowledge_base_id" {
  description = "Bedrock Knowledge Base ID"
  type        = string
}

variable "analysis_table_name" {
  description = "DynamoDB table name for analysis history"
  type        = string
  default     = "icp-analysis-history"
}

variable "credential_vault_lambda_arn" {
  description = "ARN of credential vault Lambda function"
  type        = string
}

variable "min_sample_size" {
  description = "Minimum sample size for analysis"
  type        = number
  default     = 20
}

# IAM Role for Lambda
resource "aws_iam_role" "lambda_role" {
  name = "${var.function_name}-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = {
    Name        = "ICP Refinement Lambda Role"
    Environment = "production"
  }
}

# Attach basic execution policy
resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Custom policy for service permissions
resource "aws_iam_role_policy" "lambda_permissions" {
  name = "${var.function_name}-permissions"
  role = aws_iam_role.lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "bedrock:InvokeModel",
          "bedrock:Retrieve",
          "bedrock:UpdateKnowledgeBase"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem",
          "dynamodb:GetItem",
          "dynamodb:Query"
        ]
        Resource = "arn:aws:dynamodb:${var.aws_region}:*:table/${var.analysis_table_name}"
      },
      {
        Effect = "Allow"
        Action = [
          "lambda:InvokeFunction"
        ]
        Resource = var.credential_vault_lambda_arn
      },
      {
        Effect = "Allow"
        Action = [
          "cloudwatch:PutMetricData"
        ]
        Resource = "*"
      }
    ]
  })
}

# Lambda Function
resource "aws_lambda_function" "icp_refinement" {
  filename         = "../dist/lambda.zip"
  function_name    = var.function_name
  role            = aws_iam_role.lambda_role.arn
  handler         = "index.handler"
  source_code_hash = filebase64sha256("../dist/lambda.zip")
  runtime         = "nodejs18.x"
  timeout         = 900  # 15 minutes
  memory_size     = 1024

  environment {
    variables = {
      AWS_REGION                  = var.aws_region
      KNOWLEDGE_BASE_ID           = var.knowledge_base_id
      ANALYSIS_TABLE_NAME         = var.analysis_table_name
      CREDENTIAL_VAULT_LAMBDA_ARN = var.credential_vault_lambda_arn
      MIN_SAMPLE_SIZE             = var.min_sample_size
      NOVA_MODEL_ID               = "amazon.nova-lite-v1:0"
    }
  }

  tags = {
    Name        = "ICP Refinement Engine"
    Environment = "production"
  }
}

# EventBridge Rule
resource "aws_cloudwatch_event_rule" "schedule" {
  name                = "${var.function_name}-schedule"
  description         = "Triggers ICP refinement analysis every 7 days"
  schedule_expression = "rate(7 days)"
  is_enabled          = true

  tags = {
    Name        = "ICP Refinement Schedule"
    Environment = "production"
  }
}

# EventBridge Target
resource "aws_cloudwatch_event_target" "lambda" {
  rule      = aws_cloudwatch_event_rule.schedule.name
  target_id = "ICPRefinementLambda"
  arn       = aws_lambda_function.icp_refinement.arn

  input = jsonencode({
    source      = "eventbridge"
    triggerType = "scheduled"
  })
}

# Lambda permission for EventBridge
resource "aws_lambda_permission" "allow_eventbridge" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.icp_refinement.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.schedule.arn
}

# CloudWatch Log Group
resource "aws_cloudwatch_log_group" "lambda_logs" {
  name              = "/aws/lambda/${var.function_name}"
  retention_in_days = 14

  tags = {
    Name        = "ICP Refinement Logs"
    Environment = "production"
  }
}

# SNS Topic for Alarms
resource "aws_sns_topic" "alarms" {
  name         = "${var.function_name}-alarms"
  display_name = "ICP Refinement Engine Alarms"

  tags = {
    Name        = "ICP Refinement Alarms"
    Environment = "production"
  }
}

# CloudWatch Alarm: Analysis Failures
resource "aws_cloudwatch_metric_alarm" "analysis_failures" {
  alarm_name          = "${var.function_name}-analysis-failures"
  alarm_description   = "Triggers when ICP analysis fails 2 consecutive times"
  comparison_operator = "LessThanOrEqualToThreshold"
  evaluation_periods  = 2
  metric_name         = "ICPAnalysisSuccess"
  namespace           = "ICPRefinement"
  period              = 86400
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.alarms.arn]

  tags = {
    Name        = "ICP Analysis Failures"
    Environment = "production"
  }
}

# CloudWatch Alarm: Low Confidence
resource "aws_cloudwatch_metric_alarm" "low_confidence" {
  alarm_name          = "${var.function_name}-low-confidence"
  alarm_description   = "Triggers when ICP confidence score is below 50"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ICPConfidenceScore"
  namespace           = "ICPRefinement"
  period              = 86400
  statistic           = "Average"
  threshold           = 50
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarms.arn]

  tags = {
    Name        = "ICP Low Confidence"
    Environment = "production"
  }
}

# CloudWatch Alarm: Insufficient Sample Size
resource "aws_cloudwatch_metric_alarm" "insufficient_sample" {
  alarm_name          = "${var.function_name}-insufficient-sample"
  alarm_description   = "Triggers when customer sample size is below minimum"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 1
  metric_name         = "CustomersAnalyzed"
  namespace           = "ICPRefinement"
  period              = 86400
  statistic           = "Average"
  threshold           = var.min_sample_size
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.alarms.arn]

  tags = {
    Name        = "ICP Insufficient Sample"
    Environment = "production"
  }
}

# Outputs
output "lambda_function_arn" {
  description = "ARN of the Lambda function"
  value       = aws_lambda_function.icp_refinement.arn
}

output "lambda_function_name" {
  description = "Name of the Lambda function"
  value       = aws_lambda_function.icp_refinement.function_name
}

output "eventbridge_rule_arn" {
  description = "ARN of the EventBridge rule"
  value       = aws_cloudwatch_event_rule.schedule.arn
}

output "iam_role_arn" {
  description = "ARN of the IAM role"
  value       = aws_iam_role.lambda_role.arn
}

output "sns_topic_arn" {
  description = "ARN of the SNS topic for alarms"
  value       = aws_sns_topic.alarms.arn
}

output "alarm_names" {
  description = "Names of CloudWatch alarms"
  value = [
    aws_cloudwatch_metric_alarm.analysis_failures.alarm_name,
    aws_cloudwatch_metric_alarm.low_confidence.alarm_name,
    aws_cloudwatch_metric_alarm.insufficient_sample.alarm_name
  ]
}
