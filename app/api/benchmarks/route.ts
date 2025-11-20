import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { UserInputs, AIBenchmarkResponse, RecommendedTool, DepartmentType, PrimaryWorkflow } from "@/types";

/**
 * Lazy initialization of OpenAI client to avoid build-time errors
 * when environment variables are not available
 */
function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is not set");
  }
  return new OpenAI({
    apiKey,
  });
}

// Rate limiting: Simple in-memory store (for production, use Redis/Upstash)
const rateLimitMap = new Map<string, { count: number; resetTime: number; timestamps: number[] }>();
const RATE_LIMIT_MAX_REQUESTS = 10; // Max requests per window
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute window

// Request size limit (in bytes) - ~50KB
const MAX_REQUEST_SIZE = 50 * 1024;

// Bot detection: Known bot user agents
const BOT_USER_AGENTS = [
  'bot', 'crawler', 'spider', 'scraper', 'curl', 'wget', 'python', 'java', 
  'go-http-client', 'httpclient', 'okhttp', 'axios', 'postman', 'insomnia',
  'headless', 'phantom', 'selenium', 'playwright', 'puppeteer', 'chrome-headless'
];

// Minimum time between requests (milliseconds) - humans need at least 1 second
const MIN_REQUEST_INTERVAL_MS = 1000;

/**
 * Simple rate limiting check (increments counter)
 */
function checkRateLimit(identifier: string): { allowed: boolean; remaining: number; resetTime: number; tooFast?: boolean } {
  const now = Date.now();
  const record = rateLimitMap.get(identifier);

  if (!record || now > record.resetTime) {
    // New window or expired
    rateLimitMap.set(identifier, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS, timestamps: [now] });
    return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - 1, resetTime: now + RATE_LIMIT_WINDOW_MS };
  }

  // Check for too-fast requests (bot-like behavior)
  if (record.timestamps.length > 0) {
    const lastRequest = record.timestamps[record.timestamps.length - 1];
    const timeSinceLastRequest = now - lastRequest;
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL_MS) {
      // Too fast - likely a bot
      record.timestamps.push(now);
      return { allowed: false, remaining: 0, resetTime: record.resetTime, tooFast: true };
    }
  }

  if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false, remaining: 0, resetTime: record.resetTime };
  }

  record.count += 1;
  record.timestamps.push(now);
  // Keep only last 20 timestamps to avoid memory growth
  if (record.timestamps.length > 20) {
    record.timestamps = record.timestamps.slice(-20);
  }
  
  return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - record.count, resetTime: record.resetTime };
}

/**
 * Get current rate limit status without incrementing (for response headers)
 */
function getRateLimitStatus(identifier: string): { remaining: number; resetTime: number } {
  const now = Date.now();
  const record = rateLimitMap.get(identifier);

  if (!record || now > record.resetTime) {
    return { remaining: RATE_LIMIT_MAX_REQUESTS, resetTime: now + RATE_LIMIT_WINDOW_MS };
  }

  return {
    remaining: Math.max(0, RATE_LIMIT_MAX_REQUESTS - record.count),
    resetTime: record.resetTime,
  };
}

/**
 * Get client identifier for rate limiting
 */
function getClientIdentifier(request: NextRequest): string {
  // Use IP address or a combination of IP + user agent
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || 
             request.headers.get("x-real-ip") || 
             "unknown";
  return ip;
}

/**
 * Validate and sanitize user inputs
 */
function validateInputs(inputs: any): { valid: boolean; error?: string; sanitized?: UserInputs; isBot?: boolean } {
  // Honeypot check: if _honeypot field is filled, it's likely a bot
  if (inputs._honeypot && inputs._honeypot.trim() !== "") {
    console.warn("Bot detected: honeypot field filled");
    return { valid: false, error: "Invalid request", isBot: true };
  }

  // Check required fields exist
  if (!inputs.departmentType || !inputs.primaryWorkflow || 
      inputs.teamSize === undefined || inputs.averageHourlyCost === undefined) {
    return { valid: false, error: "Missing required fields" };
  }

  // Validate departmentType matches allowed values
  const validDepartmentTypes: DepartmentType[] = [
    "B2B SaaS / Software",
    "B2B Services (Agency or Consulting)",
    "B2B Product / Manufacturing",
    "B2C / Commerce / Marketplace",
  ];
  if (!validDepartmentTypes.includes(inputs.departmentType)) {
    return { valid: false, error: "Invalid departmentType" };
  }

  // Validate primaryWorkflow matches allowed values
  const validWorkflows: PrimaryWorkflow[] = [
    "LinkedIn content + campaigns",
    "LinkedIn outreach + list building",
    "Email nurture + sequences",
    "Podcast → content multipliers",
    "AI video creation",
    "Video editing + repurposing",
    "Demand gen reporting + attribution",
    "Ad variant + creative testing",
    "Sales enablement assets",
    "Trade shows + conferences",
    "Webinars + online events",
    "Live events (LinkedIn Live, virtual sessions)",
  ];
  if (!validWorkflows.includes(inputs.primaryWorkflow)) {
    return { valid: false, error: "Invalid primaryWorkflow" };
  }

  // Validate teamSize: must be integer between 1 and 1000
  const teamSize = Number(inputs.teamSize);
  if (!Number.isInteger(teamSize) || teamSize < 1 || teamSize > 1000) {
    return { valid: false, error: "teamSize must be an integer between 1 and 1000" };
  }

  // Validate averageHourlyCost: must be number between $1 and $5000
  const averageHourlyCost = Number(inputs.averageHourlyCost);
  if (isNaN(averageHourlyCost) || averageHourlyCost < 1 || averageHourlyCost > 5000) {
    return { valid: false, error: "averageHourlyCost must be between $1 and $5000" };
  }

  return {
    valid: true,
    sanitized: {
      departmentType: inputs.departmentType,
      primaryWorkflow: inputs.primaryWorkflow,
      teamSize: teamSize,
      averageHourlyCost: averageHourlyCost,
      // Don't include honeypot in sanitized output
    },
  };
}

/**
 * Detect if request is from a bot
 */
function detectBot(request: NextRequest): { isBot: boolean; reason?: string } {
  const userAgent = request.headers.get("user-agent") || "";
  const userAgentLower = userAgent.toLowerCase();

  // Check for bot user agents
  for (const botPattern of BOT_USER_AGENTS) {
    if (userAgentLower.includes(botPattern)) {
      return { isBot: true, reason: `Bot detected: ${botPattern}` };
    }
  }

  // Check for missing or suspicious user agent
  if (!userAgent || userAgent.length < 10) {
    return { isBot: true, reason: "Missing or suspicious user agent" };
  }

  // Check for missing common browser headers
  const acceptHeader = request.headers.get("accept");
  const acceptLanguage = request.headers.get("accept-language");
  
  // Real browsers usually send Accept header
  if (!acceptHeader) {
    return { isBot: true, reason: "Missing Accept header" };
  }

  // Check for API testing tools
  if (userAgentLower.includes("postman") || userAgentLower.includes("insomnia") || 
      userAgentLower.includes("httpie") || userAgentLower.includes("rest-client")) {
    return { isBot: true, reason: "API testing tool detected" };
  }

  return { isBot: false };
}

/**
 * Sanitize error messages to avoid leaking internal details
 */
function sanitizeError(error: unknown): string {
  if (error instanceof Error) {
    // Only return generic error messages, not internal details
    const message = error.message.toLowerCase();
    if (message.includes("openai") || message.includes("api")) {
      return "Service temporarily unavailable. Please try again later.";
    }
    if (message.includes("timeout") || message.includes("network")) {
      return "Request timeout. Please try again.";
    }
    // For other errors, return a generic message
    return "An unexpected error occurred. Please try again.";
  }
  return "An unexpected error occurred. Please try again.";
}

/**
 * Filter out redundant tools based on feature overlap.
 * Examples: Descript includes transcription, so Otter.ai and other transcription-only tools
 * should be removed if Descript is present.
 */
function filterRedundantTools(tools: RecommendedTool[]): RecommendedTool[] {
  const filtered: RecommendedTool[] = [];
  const toolNames = tools.map((t) => t.name.toLowerCase());
  const hasDescript = toolNames.some((n) => n.includes("descript"));
  const highEndVideoKeywords = ["runway", "veo", "flow pro", "gen-4"];
  let hasHighEndVideo = false;

  // Category-level keywords and state flags for LinkedIn outreach, enrichment, and automation
  const outreachSequencerKeywords = ["apollo", "smartlead"];
  const enrichmentKeywords = ["zoominfo", "clay", "dropcontact", "lusha"];
  const automationKeywords = ["phantombuster", "waalaxy"];

  let hasOutreachSequencer = false;
  let hasEnrichmentTool = false;
  let hasAutomationTool = false;

  for (const tool of tools) {
    const toolNameLower = tool.name.toLowerCase();
    let isRedundant = false;

    // Rule 1: Descript includes transcription, so Otter.ai is redundant
    if (toolNameLower.includes("otter") && hasDescript) {
      isRedundant = true;
    }

    // Rule 2: If Descript is present, skip other transcription-only tools
    if (hasDescript) {
      const transcriptionOnlyTools = ["otter", "trint", "sonix"];
      if (transcriptionOnlyTools.some((tt) => toolNameLower.includes(tt))) {
        isRedundant = true;
      }
    }

    // Rule 3: Only keep the first high-end video generation tool (Runway, Flow/Veo, etc.)
    const isHighEndVideo = highEndVideoKeywords.some((kw) =>
      toolNameLower.includes(kw)
    );
    if (isHighEndVideo) {
      if (hasHighEndVideo) {
        isRedundant = true;
      } else {
        hasHighEndVideo = true;
      }
    }

    // Rule 4: Only keep the first outreach/sequencer tool (Apollo.io, Smartlead.ai)
    const isOutreachSequencer = outreachSequencerKeywords.some((kw) =>
      toolNameLower.includes(kw)
    );
    if (isOutreachSequencer) {
      if (hasOutreachSequencer) {
        isRedundant = true;
      } else {
        hasOutreachSequencer = true;
      }
    }

    // Rule 5: Only keep the first enrichment tool (ZoomInfo, Clay, Dropcontact, Lusha)
    const isEnrichmentTool = enrichmentKeywords.some((kw) =>
      toolNameLower.includes(kw)
    );
    if (isEnrichmentTool) {
      if (hasEnrichmentTool) {
        isRedundant = true;
      } else {
        hasEnrichmentTool = true;
      }
    }

    // Rule 6: Only keep the first automation/scraping tool (PhantomBuster, Waalaxy)
    const isAutomationTool = automationKeywords.some((kw) =>
      toolNameLower.includes(kw)
    );
    if (isAutomationTool) {
      if (hasAutomationTool) {
        isRedundant = true;
      } else {
        hasAutomationTool = true;
      }
    }

    // Rule 7: If we already added this tool (exact duplicate), skip it
    if (filtered.some((t) => t.name.toLowerCase() === toolNameLower)) {
      isRedundant = true;
    }

    if (!isRedundant) {
      filtered.push(tool);
    }
  }

  return filtered;
}

export async function POST(request: NextRequest) {
  try {
    // Check request size limit
    const contentLength = request.headers.get("content-length");
    if (contentLength && parseInt(contentLength) > MAX_REQUEST_SIZE) {
      return NextResponse.json(
        { error: "Request too large" },
        { status: 413 }
      );
    }

    // Bot detection
    const botDetection = detectBot(request);
    if (botDetection.isBot) {
      console.warn(`Bot detected: ${botDetection.reason} - IP: ${getClientIdentifier(request)}`);
      // Return generic error without revealing detection method
      return NextResponse.json(
        { error: "Invalid request" },
        { status: 403 }
      );
    }

    // Rate limiting check
    const clientId = getClientIdentifier(request);
    const rateLimit = checkRateLimit(clientId);
    if (!rateLimit.allowed) {
      // If too fast, it's likely a bot
      if (rateLimit.tooFast) {
        console.warn(`Suspicious activity detected: requests too fast - IP: ${clientId}`);
        return NextResponse.json(
          { error: "Invalid request" },
          { status: 403 }
        );
      }
      
      return NextResponse.json(
        { 
          error: "Too many requests. Please try again later.",
          retryAfter: Math.ceil((rateLimit.resetTime - Date.now()) / 1000)
        },
        { 
          status: 429,
          headers: {
            "Retry-After": Math.ceil((rateLimit.resetTime - Date.now()) / 1000).toString(),
            "X-RateLimit-Limit": RATE_LIMIT_MAX_REQUESTS.toString(),
            "X-RateLimit-Remaining": rateLimit.remaining.toString(),
            "X-RateLimit-Reset": new Date(rateLimit.resetTime).toISOString(),
          }
        }
      );
    }

    // Check API key exists
    if (!process.env.OPENAI_API_KEY) {
      console.error("OPENAI_API_KEY environment variable is not set");
      return NextResponse.json(
        { error: "Service configuration error" },
        { status: 500 }
      );
    }

    // Parse and validate request body
    let requestBody: any;
    try {
      requestBody = await request.json();
    } catch (parseError) {
      return NextResponse.json(
        { error: "Invalid JSON in request body" },
        { status: 400 }
      );
    }

    // Validate and sanitize inputs
    const validation = validateInputs(requestBody);
    if (!validation.valid || !validation.sanitized) {
      // If bot detected via honeypot, return 403 instead of 400
      if (validation.isBot) {
        console.warn(`Bot detected via honeypot - IP: ${clientId}`);
        return NextResponse.json(
          { error: "Invalid request" },
          { status: 403 }
        );
      }
      return NextResponse.json(
        { error: validation.error || "Invalid input" },
        { status: 400 }
      );
    }

    const inputs: UserInputs = validation.sanitized;

    // Function schema for OpenAI tool calling
    const functionDefinition = {
      name: "suggest_marketing_ai_benchmarks",
      description:
        "Generate workflow breakdown, task-level automation coverage, efficiency gains, and revenue uplift for a marketing department scenario.",
      parameters: {
        type: "object",
        properties: {
          tasks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                hoursPerRun: { type: "number" },
                aiCoveragePct: { type: "number", minimum: 0, maximum: 100 },
                efficiencyGainPct: {
                  type: "number",
                  minimum: 0,
                  maximum: 100,
                },
              },
              required: ["name", "hoursPerRun", "aiCoveragePct", "efficiencyGainPct"],
            },
          },
          recommendedTools: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                billingModel: {
                  type: "string",
                  enum: ["per_user", "per_account"],
                },
                licensePerUser: { type: "number" },
                accountCostPerMonth: { type: "number" },
              },
              required: ["name", "billingModel"],
            },
          },
          revenueModel: {
            type: "object",
            properties: {
              revenuePerAsset: { type: "number" },
              expectedIncrementalConversionLiftPct: {
                type: "number",
                minimum: 0,
                maximum: 100,
              },
            },
          },
          confidencePct: { type: "number", minimum: 0, maximum: 100 },
        },
        required: ["tasks", "recommendedTools", "confidencePct"],
        // revenueModel is optional; only for clearly revenue-linked workflows
      },
    };

    // User prompt: improved marketing AI tools report version
    const prompt = `You are a senior marketing AI consultant analyzing a ${inputs.departmentType} marketing department.



The team is working on: ${inputs.primaryWorkflow}

Team size: ${inputs.teamSize} marketers

Average hourly cost: $${inputs.averageHourlyCost}



/**

GOAL

Break down this workflow into concrete marketing tasks, then propose a lean, realistic AI tool stack with:

- Task-level hours per run

- AI coverage and efficiency gains within believable ranges

- Minimal, non-redundant tools that match team size, content volume, and AI maturity

- Optional revenueModel only when the workflow clearly affects pipeline or revenue

**/



1) TASK BREAKDOWN (MARKETING-ONLY)



Break down the workflow "${inputs.primaryWorkflow}" into specific, real marketing tasks.



For each task:

- Use marketing language only (no IT/engineering tasks).

- Give hoursPerRun between 0.5 and 40 hours.

- Estimate aiCoveragePct: what percentage of that task can be automated or significantly accelerated with AI.

- Estimate efficiencyGainPct: how much faster the covered slice becomes with AI.



Guardrails:

- aiCoveragePct usually between 20 and 80 (avoid 0 and 100 unless clearly justified).

- efficiencyGainPct usually between 10 and 60 (avoid 0 and 100).

- Sum of hoursPerRun across tasks must be realistic for this workflow and team size.

- Examples of valid tasks:

  - "Draft LinkedIn post variants"

  - "Research and outline long-form article"

  - "Clip podcast into short social videos"

  - "Prepare UTM and campaign setup in HubSpot"

  - "Build lead list from LinkedIn and enrich with emails"

  - "Generate video content from text prompts"

  - "Create email nurture sequence copy"

  - "Summarize webinar transcript into blog + email"



2) LINKEDIN & LIST-BUILDING WORKFLOWS



If the primary workflow string includes "LinkedIn" (case-insensitive) or clearly refers to outbound social selling or SDR-style outreach on LinkedIn, treat it as a LinkedIn outreach + list-building workflow and apply this section strictly.



If the primary workflow involves LinkedIn outreach, list building, SDR-style sequences, or ABM (e.g. "LinkedIn outreach + list building", "Outbound sequences", "ABM campaign"):



Core building blocks:

- LinkedIn Sales Navigator or at least advanced LinkedIn search.

- One list-building/sequencer:

  - Apollo.io ($59–99/user/month, per_user)

  - Smartlead.ai ($39–79/month, per_account)

- One enrichment tool:

  - Clay (~$149–800/month, per_account)

  - Dropcontact (~$49–199/month, per_account)

  - Lusha (~$39–99/user/month, per_user)

  - ZoomInfo (~$1,250/user/month equivalent, per_user)

- Optionally, one scraping/automation tool:

  - PhantomBuster (~$70–200/month, per_account)

  - Waalaxy (~$49–99/month, per_account)



Use AI to:

- Generate and refine ICP definitions and search strings.

- Draft and personalize connection requests and follow-ups at scale.

- Summarize profiles for fast personalization.

- Score and prioritize leads.



Constraints:

- Recommend at most:

  - 1 outreach/sequencer (Apollo OR Smartlead).

  - 1 enrichment platform (Clay OR Dropcontact OR Lusha OR ZoomInfo).

  - 0–1 automation tool (PhantomBuster OR Waalaxy).

- Do NOT recommend more than one tool per category.

- Pick ZoomInfo only when team size and ACV justify it (mid-market/enterprise motion).

- For LinkedIn-centric workflows, do NOT recommend unrelated email platforms, generic CRMs, or other sales tools beyond those listed in this section unless the user input explicitly mentions them by name.



3) EMAIL, DEMAND GEN, AND NURTURE WORKFLOWS



If the workflow is "Email nurture + sequences", "Lead nurturing", "Lifecycle automation", or similar:



- Consider Apollo.io or Smartlead.ai as above when outbound is part of the motion.

- Consider CRM-native AI for scoring and prioritization when CRM is in play:

  - HubSpot AI (Marketing Hub Professional+; treat as per_account with a realistic monthly cost).

  - Salesforce Einstein (Sales Cloud Professional+; treat as per_user with mid-tier pricing).

- Use AI to:

  - Draft nurture sequences and variants.

  - Generate subject line and preheader variants.

  - Summarize user behavior and suggest next-best-touch logic.



Only add CRM AI if the workflow clearly uses CRM for scoring, MQL/SQL, or pipeline reporting.



4) CONTENT & COPY HEAVY WORKFLOWS



For workflows like "Content marketing engine", "Blog + SEO", "Thought leadership", "Social media content", "Campaign copy":



Choose from LLM/content tools based on team size and maturity:



- Solo marketers / very small teams (1–3 people, low AI maturity):

  - ChatGPT Plus ($20/user/month, per_user) – general-purpose AI copy assistant.

  - Claude Pro ($20/user/month, per_user) – especially when long documents/transcripts must be summarized or turned into long-form content.

  - Copy.ai or Jasper Creator (~$36–49/user/month, per_user) – for template-driven copy and workflows, especially if they want many variations and simple templates.



- Small to mid-sized teams (3–20 people) regularly producing content:

  - ChatGPT Team (~$25–30/user/month, per_user) – shared AI writing workspace.

  - Jasper Business (seat-based, per_user) – if brand voice and campaign workflows are central.

  - Limit overlap: choose either a generic LLM (ChatGPT Team or Claude) plus at most one marketing-specialized platform (Jasper OR Copy.ai, not both).



- Large or regulated enterprises:

  - ChatGPT Enterprise (custom, per_user) – when security, governance, and centralization are mandatory.

  - Avoid recommending Enterprise scale tools for small teams or simple workflows.



Rules:

- Do NOT stack multiple general-purpose LLMs for the same task: if you pick ChatGPT, do not also pick Claude for the same copy job.

- Do NOT stack both Jasper and Copy.ai for the same generic copy pipeline.

- Favor the minimal set that covers ideation, drafting, repurposing, and optimization.

- Assume realistic usage:

  - LLM tools typically yield 20–50% time savings on content tasks, not 90–100%.

  - They can often double output (2× campaigns or content pieces) without linear headcount increase, but your hours and efficiency estimates must remain conservative.



5) PODCAST → CONTENT MULTIPLIERS



If the workflow is "Podcast → content multipliers" or involves recordings (webinars, interviews, live events turned into content):



- Recording:

  - Riverside.fm ($19–29/user/month, per_user) – recording and remote interview.

- Editing and transcription:

  - Descript ($24/user/month, per_user) – includes transcription + editing; if you choose Descript, do NOT recommend Otter, Trint, or Sonix.

- Repurposing:

  - Use general LLMs (ChatGPT Plus/Team, Claude) or a content platform (Jasper/Copy.ai) for:

    - Show notes.

    - Blog posts from transcripts.

    - Social clips and email recaps.



Rules:

- If Descript is selected, explicitly avoid any other transcription-only tools.

- Keep stack lean: Riverside + Descript + one LLM or content platform is usually enough.



6) AI VIDEO CREATION WORKFLOWS ("AI video creation")



If the primary workflow is "AI video creation" (marketing creating net-new video assets without filming):



- Assume the need is to go from idea → script → visuals → generated video.



Recommend a small, complementary stack:

- Story & script:

  - Reve.com Pro (~$20/user/month, per_user) – story building, script, narrative structure.

  - OR use a general LLM (ChatGPT / Claude) if there is already such a tool in the stack.

- Visual assets:

  - Adobe Firefly via Creative Cloud ($55–85/user/month, per_user) – AI image generation and visual design.

- Video generation:

  - Runway Gen-4 (~$12–95/user/month, per_user or per_account) for professional-grade text-to-video.

  - OR Google Flow Pro ($12/user/month, per_user) for cinematic videos integrated with Google Workspace (includes Veo 3).



Rules:

- Pick ONE primary video generator: Runway Gen-4 OR Google Flow Pro, not both, unless the workflow clearly calls for both (rare; default to one).

- Always avoid over-building the stack for small teams that only need a few clips per month.

- Do NOT add speculative or unreleased tools; stick to tools with well-understood capabilities.



7) GENERAL VIDEO WORKFLOWS (not pure AI video creation)



If the workflow is more general video marketing (editing recorded video, adding AI b-roll, etc.):



- Consider:

  - Runway Gen-4 OR Google Flow Pro for AI-generated b-roll and concept shots.

  - Descript for transcript-based editing and repurposing.

  - Traditional editing tools are assumed but not included in the AI stack unless specifically relevant.



Keep the AI tools limited to the core bottlenecks (e.g. generating b-roll, repurposing for social).



8) DESKTOP OPTIMIZATION & DICTATION



If the workflow involves a lot of manual writing, note-taking, or "I talk, AI writes" behavior (e.g. busy execs, sales leaders, or marketers dictating content):



- Wispr Flow (~$20–30/user/month, per_user) for dictation and faster drafting of emails, posts, and briefs.



Do not recommend Wispr Flow unless speech-to-text and dictation clearly help the described workflow.



9) CODE & LEAD MAGNET GENERATION



If the marketing team is building internal tools, ROI calculators, or interactive lead magnets:



- Cursor (~$20/user/month, per_user) – AI-powered code editor for building small web tools and calculators used by marketing.

- Lovable (~$20–40/user/month, per_user) – rapid prototyping and app-building for lead magnets and microsites.



Only recommend these when:

- The primary workflow explicitly includes "building tools," "ROI calculators," "microsites," or similar.

- The marketing team has at least some no-code/low-code appetite.



10) LEAD SCORING & CRM AI



If the workflow involves lead scoring, pipeline management, or sales enablement:



- Prefer built-in AI in:

  - HubSpot (Marketing/Sales Hub Professional+).

  - Salesforce Einstein.



Treat them as:

- HubSpot AI: per_account monthly cost (e.g. mid-tier).

- Salesforce Einstein: per_user monthly cost.



Do NOT recommend separate standalone lead-scoring AI tools when CRM AI is sufficient and already implied.



11) BILLING MODEL & PRICING



For each recommended tool:

- If pricing is per seat:

  - billingModel = "per_user"

  - licensePerUser = realistic mid-range monthly price.

- If pricing is workspace/account based:

  - billingModel = "per_account"

  - accountCostPerMonth = realistic mid-range monthly price.



Follow these patterns:

- ChatGPT Plus, ChatGPT Team, Claude Pro, Jasper seat plans, Copy.ai, Descript, Riverside, Wispr Flow, Cursor, Lovable: per_user.

- Smartlead, Clay, Dropcontact, PhantomBuster, Waalaxy, many CRM/marketing suites: per_account (unless clearly sold per seat).



Be conservative:

- Use mid-band prices, not the cheapest marketing claims.

- Avoid suggesting large enterprise contracts (ChatGPT Enterprise, ZoomInfo, big CRM plans) for tiny teams or simple workflows.



12) REVENUE MODEL (ONLY WHEN CLEARLY RELEVANT)



Provide a revenueModel ONLY IF the workflow clearly ties to leads, opportunities, or revenue. Examples:

- Email nurture sequences leading to demo bookings.

- LinkedIn outreach for pipeline.

- Paid campaigns, webinars, live events, trade shows with tracked pipeline.

- Podcasts or content programs with clear CTA and measurable lead flow.



When applicable:

- revenuePerAsset: average revenue contribution of one unit of the workflow (one campaign, sequence, or webinar).

- expectedIncrementalConversionLiftPct: conservative uplift (typically 5–25%), reflecting better personalization, more variants, and faster iteration – not total conversion rate.



If the workflow is purely brand/awareness with no clear conversion path, omit revenueModel.



13) OUTPUT FORMAT



Return a JSON object with:

- tasks: array of { name, hoursPerRun, aiCoveragePct, efficiencyGainPct }.

- recommendedTools: minimal, non-redundant array with { name, billingModel, licensePerUser?, accountCostPerMonth? }.

- confidencePct: number between 0 and 100, conservative (do not claim 100).

- revenueModel: optional, only if justified as above.



Sanity checks:

- Tasks must be plausible and aligned with real marketing practice.

- Tool stack must be lean, non-redundant, and aligned with team size and workflow.

- All numeric estimates must be conservative and defensible rather than optimistic.`;

    const openai = getOpenAIClient();
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.2, // Lower temperature for more deterministic, schema-adherent function calling
      max_tokens: 5000, // Explicit token limit to ensure complete JSON responses (tasks + tools + revenueModel)
      messages: [
        {
          role: "system",
          content: `You are an expert marketing AI consultant. You provide realistic, conservative recommendations for marketing workflow automation and AI-assisted work.

Your job is to:
- Break marketing workflows into real, discrete marketing tasks.
- Estimate hours, automation coverage, and efficiency gains within believable ranges.
- Recommend a minimal, non redundant set of AI tools with plausible pricing models.
- Only include revenueModel data when the workflow clearly influences leads or revenue.
- Prefer under-promising to over-promising; never inflate savings.

CRITICAL TOOL RECOMMENDATION RULES:

1) AVOID REDUNDANCY:
   - Descript includes transcription - do NOT also recommend Otter.ai or other transcription-only tools.
   - If recommending ChatGPT, do NOT also recommend Claude for the same exact use case.
   - Prefer a minimal set of complementary tools rather than many overlapping ones.

2) EMAIL WORKFLOWS:
   - Consider Apollo.io ($59–99/user/month), ZoomInfo (~$1,250/user/month equivalent), and Smartlead.ai ($39–79/month, account based) when appropriate.

3) OUTREACH & LINKEDIN LIST-BUILDING WORKFLOWS:
   - Core building blocks: LinkedIn Sales Navigator, list-building/sequencing tools (Apollo.io, Smartlead.ai), enrichment tools (Clay, Dropcontact, Lusha, ZoomInfo), and optionally automation tools (PhantomBuster, Waalaxy).
   - Use AI for ICP criteria refinement, search string generation, connection request and follow-up message drafting, profile summarization, and lead prioritization.
   - Only recommend 1 tool per category:
     - exactly one outreach/sequencer (Apollo.io OR Smartlead.ai),
     - exactly one enrichment platform (Clay OR Dropcontact OR Lusha OR ZoomInfo),
     - and at most one automation tool (PhantomBuster OR Waalaxy).
   - For LinkedIn-centric workflows, do NOT recommend unrelated CRMs, email service providers, or generic sales tools outside this set unless the user input explicitly requires them.

4) PRESENTATION & DESIGN:
   - Adobe Firefly (via Creative Cloud $55–85/user/month) for AI image generation and design.
   - Gamma AI (~$10–20/user/month) for AI-powered presentations.
   - Canva Pro ($13–15/user/month) for design with AI features.

5) AI VIDEO CREATION WORKFLOWS ("AI video creation"):
   - For "AI video creation" workflows, recommend a mix of tools:
     - Adobe Firefly (via Creative Cloud $55–85/user/month) for AI image generation and visual assets.
     - Runway Gen-4 (~$12–95/user/month, credit-based) for professional-grade AI video generation from text prompts with production-ready quality.
     - Google Flow Pro ($12/user/month) for cinematic video generation (includes Veo 3).
     - Reve.com Pro ($20/user/month) for story building, script development, and narrative structure.
   - Include one primary video generation tool (prefer Runway Gen-4 for professional production needs; Google Flow Pro for budget-conscious or low-volume scenarios), plus Firefly and Reve.com Pro for a complete workflow.

6) VIDEO GENERATION (general video workflows):
   - Runway Gen-4: ~$12–95/user/month (credit-based) for professional-grade text-to-video generation.
   - Google Flow Pro: $12/user/month (includes Veo 3) for cinematic video generation.
   - Reve.com Pro: $20/user/month for story building and script development.

7) DESKTOP OPTIMIZATION:
   - Wispr Flow (~$20–30/user/month) for AI dictation and faster content creation.

8) CODE & DEVELOPMENT:
   - Cursor (~$20/user/month) for AI-powered code editing and lead magnet development.
   - Lovable (~$20–40/user/month) for rapid prototyping and web tool creation.

9) LEAD SCORING:
   - Use AI features in existing CRM tools (HubSpot, Salesforce) rather than separate lead scoring tools.
   - HubSpot AI lead scoring included in Marketing Hub Professional+.
   - Salesforce Einstein included in Sales Cloud Professional+.

10) TOOL SELECTION:
   - Use your up-to-date knowledge of common marketing tools and their capabilities.
   - If you are not reasonably sure about a tool or its pricing, do not recommend it.
   - Prefer tools and price points you are confident about, even if approximate.
   - When the implied workload seems low (few runs per month or small teams), avoid recommending large, high-cost stacks; prefer a lean set of tools that matches the scale of the workflow.
   - Do NOT invent features that a tool does not have.

Guardrails for estimates:

- hoursPerRun must be between 0.5 and 40 for a single workflow cycle.
- aiCoveragePct should usually be in the 20 to 80 range. Avoid 0 or 100 unless clearly justified.
- efficiencyGainPct should usually be in the 10 to 60 range. Avoid 0 or 100.
- If you are unsure, choose the more conservative (lower) coverage and efficiency.
- The sum of all task hoursPerRun should be realistic for the workflow described (for example, a single LinkedIn post should not require 50 hours).

All tasks must be expressed in marketing language and represent real, discrete marketing activities. Examples:
- "Draft LinkedIn post variants"
- "Edit and polish long form article"
- "Create email subject line and preheader variants"
- "Clip podcast into short social videos"
- "Prepare UTM and campaign setup in HubSpot"
- "Create presentation slides with AI-generated visuals"
- "Generate video content from text prompts"
- "Build lead magnet landing page"
- "Dictate and optimize email drafts"

Do not invent engineering or IT tasks. Stay strictly within the marketing department workflow. However, tools like Cursor or Lovable can be recommended when workflows involve creating lead magnets, landing pages, or web tools that marketing teams build themselves.

REVENUE MODEL (when applicable):

- If the workflow is tied to lead generation, pipeline, or revenue (email nurture, LinkedIn outreach, paid campaigns, webinars, live events, trade shows, podcasts with CTAs), provide a revenueModel:`,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      tools: [
        {
          type: "function",
          function: functionDefinition,
        },
      ],
      tool_choice: {
        type: "function",
        function: { name: "suggest_marketing_ai_benchmarks" },
      },
    });

    const toolCall = completion.choices[0]?.message?.tool_calls?.[0];

    if (!toolCall || toolCall.function.name !== "suggest_marketing_ai_benchmarks") {
      return NextResponse.json(
        { error: "Failed to get function call from OpenAI" },
        { status: 500 }
      );
    }

    const result = JSON.parse(toolCall.function.arguments) as AIBenchmarkResponse;

    // Must have at least one task and one tool
    if (!result.tasks?.length || !result.recommendedTools?.length) {
      return NextResponse.json(
        { error: "OpenAI returned an incomplete benchmark result" },
        { status: 502 }
      );
    }

    // Clamp task values to safe ranges
    result.tasks = result.tasks.map((task) => ({
      ...task,
      hoursPerRun: Math.max(0.5, Math.min(task.hoursPerRun, 40)),
      aiCoveragePct: Math.max(0, Math.min(task.aiCoveragePct, 100)),
      efficiencyGainPct: Math.max(0, Math.min(task.efficiencyGainPct, 100)),
    }));

    // Validate and normalize recommended tools and billing models
    result.recommendedTools = result.recommendedTools.map((tool) => {
      if (tool.billingModel === "per_user") {
        if (!tool.licensePerUser || tool.licensePerUser <= 0) {
          // Fallback: if missing, infer from accountCostPerMonth or set a conservative default
          tool.licensePerUser = tool.accountCostPerMonth || 50;
        }
        tool.accountCostPerMonth = undefined;
      } else if (tool.billingModel === "per_account") {
        if (!tool.accountCostPerMonth || tool.accountCostPerMonth <= 0) {
          // Fallback: if missing, infer from licensePerUser or set a conservative default
          tool.accountCostPerMonth = tool.licensePerUser || 50;
        }
        tool.licensePerUser = undefined;
      } else {
        // Default to per_user if billingModel is missing or invalid
        tool.billingModel = "per_user";
        if (!tool.licensePerUser || tool.licensePerUser <= 0) {
          tool.licensePerUser = tool.accountCostPerMonth || 50;
        }
        tool.accountCostPerMonth = undefined;
      }
      return tool;
    });

    // Filter out redundant tools based on rules above
    result.recommendedTools = filterRedundantTools(result.recommendedTools);

    // Clamp confidence percentage
    result.confidencePct = Math.max(0, Math.min(result.confidencePct ?? 0, 100));

    // Clamp revenue model if present
    if (result.revenueModel) {
      if (result.revenueModel.expectedIncrementalConversionLiftPct != null) {
        result.revenueModel.expectedIncrementalConversionLiftPct = Math.max(
          0,
          Math.min(result.revenueModel.expectedIncrementalConversionLiftPct, 100)
        );
      }
      if (
        result.revenueModel.revenuePerAsset != null &&
        result.revenueModel.revenuePerAsset < 0
      ) {
        result.revenueModel.revenuePerAsset = 0;
      }
    }

    // Get current rate limit status for response headers (without incrementing)
    const currentRateLimit = getRateLimitStatus(clientId);
    
    // Add rate limit headers to successful response
    return NextResponse.json(result, {
      headers: {
        "X-RateLimit-Limit": RATE_LIMIT_MAX_REQUESTS.toString(),
        "X-RateLimit-Remaining": currentRateLimit.remaining.toString(),
        "X-RateLimit-Reset": new Date(currentRateLimit.resetTime).toISOString(),
      },
    });
  } catch (error) {
    // Log full error details server-side for debugging
    console.error("Error calling OpenAI benchmarks endpoint:", error);
    
    // Return sanitized error message to client
    const sanitizedError = sanitizeError(error);
    return NextResponse.json(
      { error: sanitizedError },
      { status: 500 }
    );
  }
}
