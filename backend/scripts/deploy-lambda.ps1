#Requires -Version 5.1
<#
.SYNOPSIS
  Deploys the BuyWise recommendation backend: Lambda + API Gateway HTTP API
  (POST /recommend) and optionally wires the DynamoDB product table.

.DESCRIPTION
  Prerequisites (verified by this script):
    - AWS CLI v2 installed and configured (aws sts get-caller-identity works)
    - Node.js available for the packaging step

  STATUS: written and reviewed but NOT executed on this machine - the AWS CLI
  is not installed here and there are no credentials (~/.aws missing), so the
  AWS steps are untested. Run this script on a machine with AWS access.

.PARAMETER Region
  AWS region (default ap-south-1 - the catalog is India-priced).

.PARAMETER FunctionName
  Lambda function name (default buywise-recommend-api).

.PARAMETER TableName
  Optional DynamoDB products table (seed it with scripts/seed-dynamodb.mjs).
  When provided, the Lambda reads products from DynamoDB and falls back to
  the bundled catalog if the table is unreachable.

.EXAMPLE
  ./scripts/deploy-lambda.ps1
  ./scripts/deploy-lambda.ps1 -Region ap-south-1 -TableName buywise-products
#>
param(
  [string]$Region = "ap-south-1",
  [string]$FunctionName = "buywise-recommend-api",
  [string]$TableName = "BuyWiseProducts",
  [string]$ApiName = "buywise-api",
  [string]$StageName = "prod"
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Split-Path -Parent $scriptDir
$zipPath = Join-Path $backendDir "dist\buywise-recommendations.zip"

# --- 0. Preflight -----------------------------------------------------------
if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
  throw "BLOCKER: AWS CLI not found. Install AWS CLI v2 and run 'aws configure'."
}
aws sts get-caller-identity --region $Region --output text --query Account *> $null
if ($LASTEXITCODE -ne 0) {
  throw "BLOCKER: AWS credentials are not configured. Run 'aws configure' first."
}
$AccountId = (aws sts get-caller-identity --region $Region --output text --query Account).Trim()
Write-Host "Deploying to account $AccountId in $Region"

# --- 1. Package -------------------------------------------------------------
node (Join-Path $scriptDir "package-lambda.mjs")
if ($LASTEXITCODE -ne 0) { throw "Packaging failed." }

# --- 2. Lambda execution role ------------------------------------------------
$RoleName = "buywise-lambda-role"
$RoleArn = "arn:aws:iam::${AccountId}:role/$RoleName"
$trustPolicy = Join-Path $env:TEMP "buywise-trust-policy.json"
@'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "lambda.amazonaws.com" },
    "Action": "sts:AssumeRole"
  }]
}
'@ | Set-Content -Path $trustPolicy -Encoding UTF8

aws iam get-role --role-name $RoleName *> $null
if ($LASTEXITCODE -ne 0) {
  aws iam create-role --role-name $RoleName `
    --assume-role-policy-document "file://$trustPolicy" --region $Region
  if ($LASTEXITCODE -ne 0) { throw "Creating the IAM role failed." }
  aws iam attach-role-policy --role-name $RoleName `
    --policy-arn "arn:aws:iam::aws:policy/AWSLambdaBasicExecutionRole" --region $Region
  Write-Host "Waiting for the new role to propagate..."
  Start-Sleep -Seconds 12
}

# --- 3. Lambda function ------------------------------------------------------
$envVars = "Variables={BUYWISE_PRODUCTS_TABLE=$TableName}"

aws lambda get-function --function-name $FunctionName --region $Region *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Creating Lambda function $FunctionName..."
  aws lambda create-function `
    --function-name $FunctionName `
    --runtime nodejs20.x `
    --architectures x86_64 `
    --role $RoleArn `
    --handler "backend/src/lambda-handler.handler" `
    --zip-file "fileb://$zipPath" `
    --timeout 15 `
    --memory-size 256 `
    --environment $envVars `
    --region $Region
} else {
  Write-Host "Updating existing Lambda function $FunctionName..."
  aws lambda update-function-code --function-name $FunctionName `
    --zip-file "fileb://$zipPath" --region $Region
  aws lambda update-function-configuration --function-name $FunctionName `
    --timeout 15 --memory-size 256 --environment $envVars --region $Region
}
if ($LASTEXITCODE -ne 0) { throw "Creating/updating the Lambda function failed." }
Write-Host "Waiting for the function to become active..."
aws lambda wait function-active --function-name $FunctionName --region $Region

# --- 4. API Gateway HTTP API (POST /recommend) --------------------------------
$FunctionArn = "arn:aws:lambda:${Region}:${AccountId}:function:$FunctionName"
$ApiId = (aws apigatewayv2 create-api --name $ApiName --protocol-type HTTP `
  --region $Region --output text --query ApiId).Trim()
if (-not $ApiId) { throw "Creating the HTTP API failed." }

$IntegrationId = (aws apigatewayv2 create-integration --api-id $ApiId `
  --integration-type AWS_PROXY --integration-uri $FunctionArn `
  --payload-format-version "2.0" --region $Region `
  --output text --query IntegrationId).Trim()

aws apigatewayv2 create-route --api-id $ApiId `
  --route-key "POST /recommend" --target "integrations/$IntegrationId" --region $Region
aws apigatewayv2 create-stage --api-id $ApiId --stage-name $StageName `
  --auto-deploy --region $Region
aws apigatewayv2 update-api --api-id $ApiId --region $Region `
  --cors-configuration "AllowOrigins=*,AllowMethods=POST,OPTIONS,AllowHeaders=Content-Type"

# Allow API Gateway to invoke the Lambda
aws lambda add-permission --function-name $FunctionName `
  --statement-id "apigw-invoke-$ApiId" --action "lambda:InvokeFunction" `
  --principal "apigateway.amazonaws.com" `
  --source-arn "arn:aws:execute-api:${Region}:${AccountId}:$ApiId/*/*/recommend" `
  --region $Region

$Endpoint = "https://$ApiId.execute-api.$Region.amazonaws.com/$StageName/recommend"
Write-Host ""
Write-Host "============================================================="
Write-Host "BuyWise backend deployed."
Write-Host "  Lambda function : $FunctionName"
Write-Host "  API endpoint    : POST $Endpoint"
if ($TableName -ne "") {
  Write-Host "  Products table  : $TableName (with bundled-catalog fallback)"
}
Write-Host "Test with:"
$body = '{"budget":90000,"ram":16,"storage":512,"gpu":"mid-range","os":"Windows","workloads":["AI/ML","Programming"]}'
Write-Host "  Invoke-RestMethod -Method Post -Uri `"$Endpoint`" -ContentType 'application/json' -Body (`$body | ConvertTo-Json)"
Write-Host "============================================================="


