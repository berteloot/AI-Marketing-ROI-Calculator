# Deployment Guide: Render via GitHub

This guide will walk you through deploying your Next.js ROI Calculator to Render using GitHub integration.

## Prerequisites

1. **GitHub Account** - Your code must be in a GitHub repository
2. **Render Account** - Sign up at [render.com](https://render.com) (free tier available)
3. **OpenAI API Key** - You'll need this for environment variables

## Step-by-Step Deployment

### Step 1: Push Your Code to GitHub

1. **Initialize Git** (if not already done):
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   ```

2. **Create a GitHub Repository**:
   - Go to [github.com](https://github.com) and create a new repository
   - Name it (e.g., `nytelligence-roi-calculator`)
   - **Do NOT** initialize with README, .gitignore, or license (you already have these)

3. **Push Your Code**:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
   git branch -M main
   git push -u origin main
   ```

### Step 2: Connect GitHub to Render

1. **Sign in to Render**:
   - Go to [dashboard.render.com](https://dashboard.render.com)
   - Sign up or log in (you can use GitHub OAuth)

2. **Authorize GitHub**:
   - In Render dashboard, go to **Account Settings** → **Connected Accounts**
   - Click **Connect** next to GitHub
   - Authorize Render to access your repositories

### Step 3: Create a New Web Service

1. **New Web Service**:
   - Click **New +** → **Web Service**
   - Select your GitHub repository (`nytelligence-roi-calculator`)

2. **Configure the Service**:
   - **Name**: `nytelligence-roi` (or your preferred name)
   - **Region**: Choose closest to your users
   - **Branch**: `main` (or your default branch)
   - **Root Directory**: Leave empty (root of repo)
   - **Runtime**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Plan**: Choose **Starter** (free tier) or **Standard** (paid)

3. **Environment Variables**:
   - Click **Environment** tab
   - Add the following:
     - **Key**: `OPENAI_API_KEY`
     - **Value**: Your OpenAI API key (keep this secret!)
     - **Key**: `NODE_ENV`
     - **Value**: `production`

4. **Advanced Settings** (Optional):
   - **Health Check Path**: `/` (or leave default)
   - **Auto-Deploy**: `Yes` (deploys on every push to main branch)

### Step 4: Deploy

1. **Create Service**:
   - Click **Create Web Service**
   - Render will start building your application
   - This takes 5-10 minutes the first time

2. **Monitor Build**:
   - Watch the build logs in real-time
   - If there are errors, check:
     - Node version compatibility
     - Missing dependencies
     - Build command issues

3. **Verify Deployment**:
   - Once deployed, you'll get a URL like: `https://nytelligence-roi.onrender.com`
   - Visit the URL to test your application

## Using render.yaml (Alternative Method)

If you prefer configuration-as-code, you can use the `render.yaml` file included in this repo:

1. **Create Service from Blueprint**:
   - In Render dashboard, click **New +** → **Blueprint**
   - Select your repository
   - Render will detect `render.yaml` and use it

2. **Set Environment Variables**:
   - Still need to set `OPENAI_API_KEY` in the dashboard
   - Go to your service → **Environment** tab
   - Add `OPENAI_API_KEY` with your value

## Post-Deployment Checklist

- [ ] Application loads successfully
- [ ] API routes work (test the `/api/benchmarks` endpoint)
- [ ] Environment variables are set correctly
- [ ] Health check passes
- [ ] Custom domain configured (if needed)

## Troubleshooting

### Build Fails

**Error**: `Module not found` or dependency issues
- **Solution**: Ensure `package.json` has all dependencies listed
- Check build logs for specific missing packages

**Error**: `TypeScript errors`
- **Solution**: Run `npm run build` locally first to catch errors
- Fix any TypeScript issues before pushing

### Runtime Errors

**Error**: `OPENAI_API_KEY is not defined`
- **Solution**: Double-check environment variable is set in Render dashboard
- Ensure variable name matches exactly (case-sensitive)

**Error**: `Port already in use`
- **Solution**: Render handles this automatically, but ensure `start` command is `npm start`

### Performance Issues

- **Upgrade Plan**: Free tier has limitations (spins down after inactivity)
- **Standard Plan**: Keeps service always-on for better performance
- **Consider**: Add caching or optimize API calls

## Custom Domain (Optional)

1. **Add Domain**:
   - Go to your service → **Settings** → **Custom Domains**
   - Add your domain (e.g., `roi.yourdomain.com`)

2. **DNS Configuration**:
   - Render will provide DNS records to add
   - Add CNAME record pointing to Render's provided hostname

3. **SSL Certificate**:
   - Render automatically provisions SSL certificates via Let's Encrypt

## Continuous Deployment

By default, Render auto-deploys when you push to your main branch:

1. **Make Changes Locally**
2. **Commit and Push**:
   ```bash
   git add .
   git commit -m "Your changes"
   git push origin main
   ```
3. **Render Automatically Deploys**: Check dashboard for deployment status

## Environment-Specific Configurations

For different environments (staging, production):

1. **Create Separate Services**: One for staging, one for production
2. **Use Different Branches**: 
   - Staging: `develop` branch
   - Production: `main` branch
3. **Different Environment Variables**: Set per service

## Security Best Practices

- ✅ Never commit `.env` files (already in `.gitignore`)
- ✅ Use Render's environment variables for secrets
- ✅ Rotate API keys periodically
- ✅ Enable rate limiting (already implemented in your API)
- ✅ Monitor usage and costs

## Cost Considerations

- **Free Tier**: 
  - 750 hours/month free
  - Spins down after 15 minutes of inactivity
  - Good for development/testing
  
- **Starter Plan** ($7/month):
  - Always-on service
  - Better for production use

## Support Resources

- [Render Documentation](https://render.com/docs)
- [Next.js Deployment Guide](https://nextjs.org/docs/deployment)
- [Render Status Page](https://status.render.com)

---

**Need Help?** Check Render's logs in the dashboard for detailed error messages.

