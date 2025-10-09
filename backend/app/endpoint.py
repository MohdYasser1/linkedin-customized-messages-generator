import json
from http import HTTPStatus

from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel, Field
from typing import List, Optional
from starlette.responses import Response

from crewai import LLM, Agent, Task, Crew



# Define the structure for a single experience
class Experience(BaseModel):
    title: str = Field(description="The job title.")
    company: str = Field(description="The company name.")
    employment_type: str = Field(description="e.g., 'Part-time', 'Internship'")
    duration: str = Field(description="The full duration string.")
    description: str = Field(description="The detailed description of the role.")

# Define the structure for a single education entry
class Education(BaseModel):
    institution: str = Field(description="The name of the school or university.")
    degree: str = Field(description="The degree name.")
    field_of_study: str = Field(description="The field of study.")
    duration: str = Field(description="The years of attendance.")
    grade: str = Field(description="The grade mentioned.")

# Define the structure for a single activity
class Activity(BaseModel):
    type: str = Field(description="The type of activity, e.g., 'reposted this'.")
    posted_ago: str = Field(description="The time elapsed since posting.")
    content: str = Field(description="The full text content of the post.")

# Define the main, top-level JSON structure
class LinkedInProfile(BaseModel):
    name: str = Field(description="The user's full name.")
    headline: str = Field(description="The professional headline.")
    about: str = Field(description="The complete text from the 'About' section.")
    experiences: List[Experience] = Field(description="A list of all job experiences.")
    education: List[Education] = Field(description="A list of all educational entries.")
    activities: List[Activity] = Field(description="A list of recent activities.")
    interests: str = Field(description="A synthesized paragraph about professional interests.")
    strengths: List[str] = Field(description="A list of key professional strengths.")
    others: str = Field(description="Any other relevant information.")

# Define the structure for connection vectors
class ConnectionVector(BaseModel):
    """A single, actionable reason for professional engagement."""
    rank: int = Field(description="The rank of this vector's impact, from 1 (strongest).")
    type: str = Field(description="The category of the vector (e.g., 'Timely Hook', 'Value Proposition').")
    confidence: str = Field(description="Confidence level of this vector's impact ('High', 'Medium', or 'Low').")
    detail: str = Field(description="The specific detail of the connection point.")
    actionable_opener: str = Field(description="A compelling, ready-to-use opening line for a message that leverages this vector and reflects the confidence level.")

# Define the structure for the engagement brief
class EngagementBrief(BaseModel):
    """An actionable brief containing ranked connection vectors and seniority analysis."""
    seniority_dynamic: str = Field(description="Describes the seniority relationship (e.g., 'Peer to Peer', 'Junior to Senior', 'Senior to Junior').")
    connection_vectors: List[ConnectionVector]



# Parsing LinkedIn profile agent
linkedin_profile_processor = Agent(
    role="LinkedIn Profile Processor and Analyst",
    goal="""To meticulously parse the HTML of a LinkedIn profile, extract all
    relevant information, synthesize key insights about the individual's
    strengths and interests, and format the entire output into a single, clean
    JSON object.""",
    backstory="""You are an advanced AI-powered HR analyst combined with a data
    extraction specialist. You have a unique ability to read and understand complex
    HTML structures while simultaneously interpreting the nuances of a professional's
    career story. Your precision in data extraction and your keen eye for identifying
    talent and potential are unmatched. You deliver comprehensive, structured insights
    ready for immediate use.""",
    verbose=True,
    allow_delegation=False,
)

# Parsing LinkedIn profile tasks
PARSER_TASK_PROMPT ="""
Fully analyze the provided LinkedIn profile HTML. First, extract all key data points including name, headline, about, ALL experiences, ALL education entries, and ALL recent activities.

Second, synthesize a summary of the user's professional interests as a concise paragraph that summarizes the user's professional
    passions and interests and a list of their key strengths based on the extracted data.

Finally, structure all of this information into a JSON object that strictly follows the provided schema.

HTML Content to Analyze:
```html
`{file_content}`
```
"""
process_user_profile_task = Task(
    description=PARSER_TASK_PROMPT.format(file_content='{user_html}'),
    expected_output="A single, valid JSON object containing the user's complete profile information, matching the schema of the LinkedInProfile model.",
    agent=linkedin_profile_processor,
    output_json=LinkedInProfile,
    verbose=True,
    async_execution=True
)
process_target_profile_task = Task(
    description=PARSER_TASK_PROMPT.format(file_content='{target_html}'),
    expected_output="A single, valid JSON object containing the user's complete profile information, matching the schema of the LinkedInProfile model.",
    agent=linkedin_profile_processor,
    output_json=LinkedInProfile ,
    verbose=True,
    async_execution=True
)



# Profile matching agent
engagement_strategist = Agent(
    role="Strategic Engagement Analyst",
    goal="Produce a ranked JSON brief of the most impactful connection vectors between two professional profiles.",
    backstory=(
        "You are a master of professional networking and strategic communication. Your expertise lies in analyzing "
        "complex career data and distilling it into actionable intelligence. You don't just find similarities; you "
        "identify the single most compelling hook that will grab a busy professional's attention. You value the time "
        "of the people who read your analysis, so your output is always a concise, prioritized, and actionable brief."
    ),
    verbose=True,
    allow_delegation=False,
)
# Profile matching task
connection_analysis_task = Task(
    description="""
    As a Strategic Engagement Analyst, your mission is to produce an actionable brief on the most potent connection vectors between a 'user' and a 'target'. The complete JSON data for both individuals is provided from the context of previous tasks.

    Your thinking process must be as follows:
    1.  **Assess Seniority Dynamic:** First, compare the user's and target's headlines and experience levels. Determine their professional relationship and set the 'seniority_dynamic' to one of: 'Peer to Peer', 'Junior to Senior', or 'Senior to Junior'.
    2.  **Identify All Potential Vectors:** Systematically scan both profiles for all possible connection points across Timely Hooks (recent activity), Value Propositions (user's skills matching target's needs), Shared Experiences (companies/universities), and Common Ground (skills/interests).
    3.  **Apply a Scoring Heuristic:** Score each vector on a scale of 1-10 based on its potential impact (recent, specific events are high-impact). CRITICALLY, your scoring must be influenced by the seniority dynamic. For a 'Junior to Senior' connection, a strong 'Value Proposition' is more impactful and should be scored higher than usual, while a casual 'Common Ground' might be scored lower.
    4.  **Confidence Assessment and Tone Adaptation:**
        - Select the top 3 highest-scoring vectors. ALWAYS select at least one.
        - Based on its score, assign a 'confidence' level: 'High' (score 8-10), 'Medium' (score 5-7), or 'Low' (score 1-4).
        - CRITICALLY: The 'actionable_opener' you write MUST reflect this confidence. A 'High' confidence opener is direct and assumes shared interest. A 'Low' confidence opener is more general, polite, and professional, introducing the topic more softly.
        - The 'actionable_opener' MUST reflect the seniority dynamic. When writing to a senior, the tone should be more formal, respectful, and focused on providing value.
    4.  **Final Output:** Format your brief into the specified JSON structure.
    """,
    expected_output="""
    A JSON object that strictly adheres to the 'EngagementBrief' schema. It must ALWAYS contain at least one connection vector.

    Example:
    {
      "connection_vectors": [
        {
          "rank": 1,
          "type": "Shared Experience",
          "confidence": "Medium",
          "detail": "Both attended the 'Global Leadership Summit' last year.",
          "actionable_opener": "I saw that you also attended last year's Global Leadership Summit; I found the session on sustainable growth particularly insightful and would be interested to hear your thoughts."
        },
        {
          "rank": 2,
          "type": "Common Ground",
          "confidence": "Low",
          "detail": "Both profiles list 'Market Analysis' as a skill.",
          "actionable_opener": "I came across your profile and was impressed by your extensive work in operations. As a fellow professional who focuses on market analysis, I'd be keen to connect and follow your work."
        }
      ]
    }
    """,
    agent=engagement_strategist,
    output_json=EngagementBrief,
    context=[process_user_profile_task, process_target_profile_task]
)



# Message generation agent
message_writer_agent = Agent(
    role="Executive Ghostwriter for Professional Outreach",
    goal="Craft a perfectly tailored outreach message that is concise, compelling, and adheres strictly to all provided constraints (length, tone, CTA, and special instructions).",
    backstory=(
        "You are a discreet and highly sought-after ghostwriter for C-suite executives and influential leaders. "
        "Your specialty is turning strategic briefs into powerful, personalized communication that opens doors. "
        "You understand the subtlety of tone, the importance of brevity, and how to weave a call to action into a message "
        "so naturally that it feels like an invitation. You never waste a word and your work is flawless."
    ),
    verbose=True,
    allow_delegation=False,
)
# Message generation task
write_message_task = Task(
    description="""
    As an Executive Ghostwriter, your mission is to write the final outreach message.

    **1. Analyze Your Inputs:**
    You will receive the following inputs to guide your writing:
    - **Strategic Brief:** The full context from the previous task, including the 'seniority_dynamic' and the ranked 'connection_vectors' with their 'actionable_openers'.
    - **Tone:** `{tone}`
    - **Length Constraint:** `{length}`
    - **Call to Action (CTA):** `{call_to_action}`
    - **Extra Instructions:** `{extra_instructions}`

    **2. Rules of Engagement (Your step-by-step process):**
    a. **Prioritize the Length Constraint:** First, identify the length requirement. If it is a 'Connection Request', the 200-character limit is the MOST IMPORTANT rule. Everything you write must fit.
    b. **Select the Strongest Hook:** From the Strategic Brief, select the `actionable_opener` from the highest-ranked (`rank` 1) connection vector. This will be the foundation of your message.
    c. **Draft the Body:** Weave the selected hook into a concise body. Your writing must respect the `seniority_dynamic` provided in the brief (e.g., more deference for 'Junior to Senior').
    d. **Integrate the CTA:** Naturally embed the `{call_to_action}` towards the end of the message. It should feel like a logical next step, not a demand.
    e. **Apply Tone & Special Instructions:** Review and edit the draft to perfectly match the requested `{tone}` and incorporate any `{extra_instructions}`.
    f. **Final Polish:** Read the message one last time. Cut any unnecessary words. Ensure it is flawless and meets all constraints.

    **3. Critical Constraints to Follow:**
    - **DO NOT** exceed the 200-character limit for a 'Connection Request'.
    - **DO NOT** sound like a generic template. The message must feel personal and unique.
    - **DO NOT** include placeholders like `{tone}` in your final output.

    Your final output is ONLY the text of the message itself.
    """,
    expected_output="A single block of text representing the final, ready-to-send message, adhering to all constraints.",
    agent=message_writer_agent,
    context=[connection_analysis_task] # Receives the 'EngagementBrief' from the previous task
)



# Create FastAPI router
router = APIRouter()

# Create a POST endpoint to parse and update the USER's data
@router.post("/parse_profile", response_model=LinkedInProfile)
async def parse_linkedin_profile(request: dict, authorization: Optional[str] = Header(None)):
    print("Request received for profile parsing:", request)
    
    # Extract API key from Authorization header
    api_key = None
    if authorization and authorization.startswith("Bearer "):
        api_key = authorization[7:]  # Remove "Bearer " prefix
    
    if not api_key:
        raise HTTPException(status_code=401, detail="No API key provided in Authorization header")
    
    # Extract HTML content from the request
    html_content = request.get("html_content", "")
    
    if not html_content:
        raise HTTPException(status_code=400, detail="No HTML content provided")
    
    try:
        # Update the LLM with the provided API key
        profile_llm = LLM(
            model="gemini/gemini-flash-latest",
            temperature=0.7,
            api_key=api_key
        )
        
        # Create agent with the API key
        linkedin_profile_processor.llm = profile_llm
        process_user_profile_task.agent = linkedin_profile_processor
        # Execute the task
        parse_crew = Crew(
            agegnts=[linkedin_profile_processor],
            tasks=[process_user_profile_task],
            verbose=False    
        )
        result = parse_crew.kickoff(inputs={"user_html": html_content})
        print("Profile parsing completed successfully")
        return json.loads(result.raw)
        
    except Exception as e:
        print(f"Error parsing profile: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to parse profile: {str(e)}")


@router.post("/generate_user")
async def generate_user_message(request: dict, authorization: Optional[str] = Header(None)):
    print("Request received for user message generation:", request)
    
    # Extract API key from Authorization header
    api_key = None
    if authorization and authorization.startswith("Bearer "):
        api_key = authorization[7:]  # Remove "Bearer " prefix
    
    if not api_key:
        raise HTTPException(status_code=401, detail="No API key provided in Authorization header")

@router.post("/generate")
async def generate_message(request: dict):
    print("Request received:", request)
    
    # Extract data from the request
    html_content = request.get("message", "")  # HTML content from LinkedIn profile
    url = request.get("url", "")
    timestamp = request.get("timestamp", "")
    profile_type = request.get("type", "")
    
    print(f"Processing {profile_type} from {url}")
    # print(f"HTML content length: {len(html_content)} characters")
    
    # Here you would typically call your LLM or message generation logic
    # For demonstration, we'll just return a simple response
    if profile_type == "TARGET_PROFILE":
        generated_message = "Hi! I'd love to connect and learn more about your experience. Would you be open to a brief chat?"
    else:
        generated_message = f"Generated response based on profile data (HTML length: {len(html_content)})"
    
    # Return the generated message as a JSON response
    return {
        "generated_message": generated_message,
        "message": generated_message,  # Alternative field name for compatibility
        "processed_url": url,
        "timestamp": timestamp
    }