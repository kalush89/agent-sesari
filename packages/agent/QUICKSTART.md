# Quick Start Guide: Deploy Goal Decomposition Engine (Beginner-Friendly)

This guide assumes you're new to AWS and walks you through every step to get the Goal Decomposition Engine running.

## What You'll Deploy

A system that takes high-level business goals (like "Increase revenue by 20%") and breaks them into 3 actionable SMART objectives using AI.

## Prerequisites Checklist

Before starting, you need:

- [ ] An AWS account (sign up at aws.amazon.com)
- [ ] A credit card (for AWS account verification - we'll stay in free tier)
- [ ] Node.js 20+ installed ([download here](https://nodejs.org/))
- [ ] Basic command line knowledge

## Deployment Path: Choose Your Route

### 🚀 **Option A: Quick Start (Recommended for Beginners)**
Deploy as part of your Next.js app - no Lambda setup needed.
**Time**: 15 minutes | **Difficulty**: Easy

### 🏗️ **Option B: Production Setup**
Deploy as a standalone Lambda function for better scaling.
**Time**: 45 minutes | **Difficulty**: Intermediate

---

## Option A: Quick Start (Next.js API Route)

### Step 1: Create an IAM User (Required First!)

**Important**: AWS doesn't allow root users to create Knowledge Bases. You must create an IAM user first.

1. **Log into AWS Console**: Go to https://console.aws.amazon.com (use your root account)
2. **Navigate to IAM**: Search for "IAM" in the top search bar and click it
3. **Create User**:
   - Click "Users" in left sidebar
   - Click "Create user"
   - Username: `sesari-admin`
   - Check "Provide user access to AWS Management Console"
   - Select "I want to create an IAM user"
   - Click "Next"
4. **Set Permissions**:
   - Select "Attach policies directly"
   - Search for and check these policies:
     - `AmazonBedrockFullAccess`
     - `IAMFullAccess` (needed to create roles later)
     - `AmazonS3FullAccess` (for Knowledge Base storage)
   - Click "Next"
5. **Create User**:
   - Click "Create user"
   - **IMPORTANT**: Copy the console sign-in URL and password
   - Click "Download .csv" to save credentials
6. **Sign Out and Sign Back In**:
   - Sign out of the root account
   - Use the console sign-in URL to log in as `sesari-admin`
   - Change your password when prompted

**From now on, use this IAM user account (not root) for all AWS console work.**

### Step 2: Enable AWS Bedrock Access

1. **Already logged in as IAM user** (`sesari-admin`)
2. **Navigate to Bedrock**: 
   - Search for "Bedrock" in the top search bar
   - Click "Amazon Bedrock"
3. **Enable Model Access**:
   - Click "Model access" in the left sidebar
   - Click "Enable specific models"
   - Find "Amazon Nova Lite" and check the box
   - Click "Request model access"
   - Wait 2-3 minutes for approval (usually instant)

### Step 3: Create a Knowledge Base

1. **Still logged in as IAM user** (`sesari-admin`), in Bedrock Console, click "Knowledge bases" in left sidebar
2. Click "Create knowledge base"
3. **Basic Information**:
   - Name: `sesari-company-context`
   - Description: `Historical company data for goal decomposition`
   - Click "Next"
4. **Data Source**:
   - Choose "Amazon S3" (simplest option)
   - Create a new S3 bucket or select existing one
   - Upload some sample company documents (metrics, past goals, company info)
   - Click "Next"
5. **Embeddings Model**:
   - Select "Titan Embeddings G1 - Text"
   - Click "Next"
6. **Review and Create**:
   - Click "Create knowledge base"
   - **IMPORTANT**: Copy the Knowledge Base ID (looks like `ABC123XYZ`)

### Step 4: Create Access Keys for Your IAM User

1. **In AWS Console** (logged in as `sesari-admin`), search for "IAM" and click it
2. Click "Users" in left sidebar
3. Click on your username (`sesari-admin`)
4. **Create Access Keys**:
   - Click "Security credentials" tab
   - Scroll to "Access keys"
   - Click "Create access key"
   - Select "Local code"
   - Click "Next" → "Create access key"
   - **CRITICAL**: Download the CSV file with your credentials
   - Keep this file safe and NEVER commit it to git

### Step 4: Configure Your Local Environment

1. **Open your terminal** in the project root directory

2. **Navigate to the agent package**:
   ```bash
   cd packages/agent
   ```

3. **Copy the example environment file**:
   ```bash
   # On Mac/Linux:
   cp .env.example .env
   
   # On Windows:
   copy .env.example .env
   ```

4. **Edit the .env file** (use any text editor):
   ```bash
   # On Mac/Linux:
   nano .env
   
   # On Windows:
   notepad .env
   ```

5. **Fill in your values**:
   ```env
   AWS_REGION=us-east-1
   KNOWLEDGE_BASE_ID=ABC123XYZ  # Paste your Knowledge Base ID from Step 2
   NOVA_MODEL_ID=amazon.nova-lite-v1:0
   NODE_ENV=development
   ```

6. **Save and close** the file

### Step 5: Configure AWS Credentials Locally

1. **Create AWS credentials directory**:
   ```bash
   # On Mac/Linux:
   mkdir -p ~/.aws
   
   # On Windows:
   mkdir %USERPROFILE%\.aws
   ```

2. **Create credentials file**:
   ```bash
   # On Mac/Linux:
   nano ~/.aws/credentials
   
   # On Windows:
   notepad %USERPROFILE%\.aws\credentials
   ```

3. **Add your credentials** (from the CSV you downloaded):
   ```ini
   [default]
   aws_access_key_id = YOUR_ACCESS_KEY_ID
   aws_secret_access_key = YOUR_SECRET_ACCESS_KEY
   ```

4. **Create config file**:
   ```bash
   # On Mac/Linux:
   nano ~/.aws/config
   
   # On Windows:
   notepad %USERPROFILE%\.aws\config
   ```

5. **Add your region**:
   ```ini
   [default]
   region = us-east-1
   ```

### Step 6: Install Dependencies

```bash
# From the project root:
npm install
```

### Step 7: Test the Engine

1. **Run the tests** to verify everything works:
   ```bash
   cd packages/agent
   npm test
   ```

2. **Start the Next.js development server**:
   ```bash
   # From project root:
   npm run dev
   ```

3. **Test the API endpoint**:
   
   Open a new terminal and run:
   ```bash
   curl -X POST http://localhost:3000/api/decompose-goal \
     -H "Content-Type: application/json" \
     -d '{"goal": "Increase monthly recurring revenue by 25%"}'
   ```

   You should see a JSON response with 3 SMART objectives!

### Step 8: Deploy to Vercel (Optional)

1. **Install Vercel CLI**:
   ```bash
   npm install -g vercel
   ```

2. **Deploy**:
   ```bash
   vercel
   ```

3. **Add environment variables in Vercel**:
   - Go to your project in Vercel dashboard
   - Click "Settings" → "Environment Variables"
   - Add all variables from your `.env` file
   - **DO NOT** add AWS credentials - use IAM roles instead (see production setup)

---

## Option B: Production Setup (Lambda Function)

### Prerequisites

Complete Steps 1-3 from Option A first (Bedrock access, Knowledge Base, IAM user).

### Step 1: Create IAM Role for Lambda

1. **In AWS Console**, go to IAM
2. Click "Roles" → "Create role"
3. **Select trusted entity**:
   - Choose "AWS service"
   - Select "Lambda"
   - Click "Next"
4. **Add permissions**:
   - Click "Create policy" (opens new tab)
   - Click "JSON" tab
   - Paste the contents from `packages/agent/iam-policy-example.json`
   - Click "Next: Tags" → "Next: Review"
   - Name: `SesariGoalDecompositionPolicy`
   - Click "Create policy"
   - Go back to the role creation tab and refresh policies
   - Search for `SesariGoalDecompositionPolicy` and check it
   - Also search for and check `AWSLambdaBasicExecutionRole`
   - Click "Next"
5. **Name the role**:
   - Role name: `SesariGoalDecompositionRole`
   - Click "Create role"

### Step 2: Package the Lambda Function

1. **Install dependencies**:
   ```bash
   cd packages/agent
   npm install --production
   ```

2. **Create deployment package**:
   ```bash
   # Create a zip file with code and dependencies
   zip -r goal-decomposition.zip . -x "*.test.ts" -x "node_modules/@types/*"
   ```

### Step 3: Create Lambda Function

1. **In AWS Console**, search for "Lambda"
2. Click "Create function"
3. **Basic information**:
   - Function name: `sesari-goal-decomposition`
   - Runtime: Node.js 20.x
   - Architecture: arm64
   - Execution role: "Use an existing role"
   - Select: `SesariGoalDecompositionRole`
   - Click "Create function"

4. **Upload code**:
   - In the "Code" tab, click "Upload from" → ".zip file"
   - Upload the `goal-decomposition.zip` file
   - Click "Save"

5. **Configure settings**:
   - Click "Configuration" tab → "General configuration" → "Edit"
   - Memory: 512 MB
   - Timeout: 30 seconds
   - Click "Save"

6. **Add environment variables**:
   - Click "Configuration" tab → "Environment variables" → "Edit"
   - Add:
     - `AWS_REGION`: `us-east-1`
     - `KNOWLEDGE_BASE_ID`: Your Knowledge Base ID
     - `NOVA_MODEL_ID`: `amazon.nova-lite-v1:0`
     - `NODE_ENV`: `production`
   - Click "Save"

### Step 4: Create API Gateway

1. **In AWS Console**, search for "API Gateway"
2. Click "Create API"
3. Choose "REST API" (not private) → "Build"
4. **API Details**:
   - API name: `sesari-goal-api`
   - Description: `Goal Decomposition API`
   - Click "Create API"

5. **Create resource**:
   - Click "Actions" → "Create Resource"
   - Resource name: `decompose-goal`
   - Click "Create Resource"

6. **Create POST method**:
   - Select the `/decompose-goal` resource
   - Click "Actions" → "Create Method"
   - Select "POST" from dropdown
   - Integration type: Lambda Function
   - Lambda Function: `sesari-goal-decomposition`
   - Click "Save" → "OK"

7. **Deploy API**:
   - Click "Actions" → "Deploy API"
   - Deployment stage: [New Stage]
   - Stage name: `prod`
   - Click "Deploy"
   - **Copy the Invoke URL** (looks like `https://abc123.execute-api.us-east-1.amazonaws.com/prod`)

### Step 5: Test Your Lambda

```bash
curl -X POST https://YOUR_API_URL/prod/decompose-goal \
  -H "Content-Type: application/json" \
  -d '{"goal": "Increase monthly recurring revenue by 25%"}'
```

---

## Troubleshooting

### "Knowledge Base creation with a root user is not supported"
- **Solution**: You must create and use an IAM user (see Step 1)
- Sign out of your root account
- Sign in with the IAM user you created (`sesari-admin`)
- Try creating the Knowledge Base again

### "Access Denied" Error
- Check that your IAM user/role has Bedrock permissions
- Verify your Knowledge Base ID is correct
- Ensure Nova Lite model access is enabled

### "Missing environment variables" Error
- Double-check your `.env` file has all 4 variables
- Ensure no extra spaces around the `=` sign
- Verify the file is named exactly `.env` (not `.env.txt`)

### "Knowledge Base not found" Error
- Verify the Knowledge Base ID is correct
- Check that the Knowledge Base is in the same region as your `AWS_REGION`
- Ensure the Knowledge Base has been synced (has documents)

### Tests Failing
- Run `npm install` to ensure all dependencies are installed
- Check that AWS credentials are configured correctly
- Verify you have internet connection (tests may need AWS access)

### Lambda Timeout
- Increase timeout to 30 seconds in Lambda configuration
- Check CloudWatch Logs for specific errors
- Verify Bedrock services are available in your region

---

## Next Steps

1. **Add authentication**: Protect your API with API keys or Cognito
2. **Monitor costs**: Set up AWS Budgets to alert if you exceed free tier
3. **Add logging**: Configure CloudWatch dashboards for monitoring
4. **Restrict IAM permissions**: Use specific resource ARNs instead of wildcards
5. **Add rate limiting**: Configure API Gateway throttling

---

## Cost Estimate

Staying within AWS Free Tier:
- **Lambda**: 1M requests/month free ✅
- **Nova Lite**: ~$0.10 per 1,000 requests
- **Bedrock KB**: ~$0.05 per 1,000 retrievals

**Expected cost for 1,000 goals/month**: Less than $1

---

## Getting Help

- **AWS Documentation**: https://docs.aws.amazon.com/bedrock/
- **Project Issues**: Check the GitHub repository
- **AWS Support**: Use AWS Support Center in console

---

## Security Checklist

- [ ] Never commit `.env` file to git
- [ ] Never commit AWS credentials to git
- [ ] Add `.env` to `.gitignore`
- [ ] Rotate access keys every 90 days
- [ ] Use IAM roles instead of access keys in production
- [ ] Enable MFA on your AWS account
- [ ] Restrict IAM policies to specific resources in production
