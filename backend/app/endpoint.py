import json
import re
import os

from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel, Field
from typing import List, Optional

from crewai import LLM, Agent, Task, Crew


# Global model name configuration
MODEL_NAME = "gemini/gemini-2.5-flash-lite"

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
    degree: Optional[str] = Field(default=None, description="The degree name.")
    field_of_study: Optional[str] = Field(default=None, description="The field of study.")
    duration: Optional[str] = Field(default=None, description="The years of attendance.")
    grade: Optional[str] = Field(default=None, description="The grade mentioned.")

# Define the structure for a single activity
class Activity(BaseModel):
    """A single recent activity/post on LinkedIn which the user has engaged with for example posted, commented, etc."""
    type: str = Field(description="The type of activity, e.g., 'reposted this'.")
    posted_ago: str = Field(description="The time elapsed since posting.")
    content: str = Field(description="The full text content of the post.")

# Define the main, top-level JSON structure
class LinkedInProfile(BaseModel):
    name: str = Field(description="The user's full name.")
    headline: str = Field(description="The professional headline.")
    about: str = Field(description="The complete text from the 'About' section.")
    experiences: List[Experience] = Field(default=[], description="A list of all job experiences.")
    education: List[Education] = Field(default=[], description="A list of all educational entries.")
    activities: List[Activity] = Field(default=[], description="A list of ALL recent activities.")
    interests: str = Field(description="A synthesized paragraph about professional interests.")
    strengths: List[str] = Field(description="A list of key professional strengths.")
    other: Optional[str] = Field(default=None, description="Any other relevant information like certifications or projects etc.")

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

# Define the structure for message generation request
class GenerateMessageRequest(BaseModel):
    user_data: dict = Field(description="The user's LinkedIn profile data")
    target_html: str = Field(description="The HTML content of the target profile")
    tone: str = Field(description="The desired tone for the message (e.g., 'professional', 'casual', 'friendly')")
    length: str = Field(description="The desired length of the message (e.g., 'short', 'medium', 'long')")
    call_to_action: str = Field(description="The desired call to action")
    extra_instruction: Optional[str] = Field(default="", description="Any additional instructions for message generation")


# Define a template for any agent that MUST output JSON
JSON_SYSTEM_TEMPLATE = """
You are {role}. {backstory}
Your goal is: {goal}

**CRITICAL OUTPUT INSTRUCTIONS:**
- Your FINAL and ONLY output must be the raw JSON object.
- Do NOT include any introductory text, reasoning, explanations, or concluding remarks.
- Do NOT wrap the JSON in markdown backticks (```json).
- Your entire response MUST start with `{{` and end with `}}`.
"""

JSON_PROMPT_TEMPLATE = """
Current Task: {input}

Analyze the provided LinkedIn profile HTML and extract the structured information.

Begin! Output ONLY the JSON object, nothing else.
"""

# Parsing LinkedIn profile 
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
    system_template=JSON_SYSTEM_TEMPLATE,
    prompt_template=JSON_PROMPT_TEMPLATE,
    verbose=True,
    allow_delegation=False,
    use_system_prompt=True
)
PARSER_TASK_PROMPT ="""
Fully analyze the provided LinkedIn profile HTML. Extract all key data points including name, headline, about, ALL experiences, ALL education entries, and ALL recent activities.

Synthesize a summary of the user's professional interests as a concise paragraph that summarizes the user's professional passions and add it to the interests section and a list of their key strengths based on the extracted data.

Structure all of this information into a JSON object that strictly follows the provided schema.

**CRITICAL OUTPUT INSTRUCTIONS:**
- Your FINAL and ONLY output must be the raw JSON object.
- Do NOT include any introductory text, reasoning, explanations, or concluding remarks.
- Do NOT wrap the JSON in markdown backticks (```json).
- Your entire response MUST start with `{{` and end with `}}`.

HTML Content to Analyze:
```html
{file_content}
```
"""
process_user_profile_task = Task(
    description=PARSER_TASK_PROMPT.format(file_content='{user_html}'),
    expected_output="""
        A single, raw, valid JSON object. The entire response must start with '{' and end with '}'. No other text or formatting is allowed.
    """,
    agent=linkedin_profile_processor,
    output_json=LinkedInProfile,
    verbose=True,
    async_execution=False
)
process_target_profile_task = Task(
    description=PARSER_TASK_PROMPT.format(file_content='{target_html}'),
    expected_output="A single, valid JSON object containing the user's complete profile information, matching the schema of the LinkedInProfile model.",
    agent=linkedin_profile_processor,
    output_json=LinkedInProfile,
    verbose=True,
    async_execution=True
)



# Profile matching 
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
connection_analysis_task = Task(
    description="""
    As a Strategic Engagement Analyst, your mission is to produce an actionable brief on the most potent connection vectors between a 'user' and a 'target'. 
    user_data: `{user_data}`
    target_data: (from context of target parsing task)

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
    context=[process_target_profile_task]
)



# Message generation 
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
    a. **Adhere to the Length Constraint:** Your primary guide for length is the **Length Constraint** input.
        - **If 'long', write a comprehensive and detailed message (approx. 150-200 words). Expand on the hook and provide more context.**
        - If 'medium', write a balanced and direct message (approx. 75-100 words).
        - If 'short', be brief and to the point (approx. 25-50 words).
        - **If 'Connection Request', the message MUST be under the strict 200-character limit.**
    b. **Select the Strongest Hook:** From the Strategic Brief, select the `actionable_opener` from the highest-ranked (`rank` 1) connection vector. This will be the foundation of your message.
    c. **Draft the Body:** Weave the selected hook into a concise body. Your writing must respect the `seniority_dynamic` provided in the brief (e.g., more deference for 'Junior to Senior').
    d. **Integrate the CTA:** Naturally embed the `{call_to_action}` towards the end of the message. It should feel like a logical next step, not a demand.
    e. **Apply Tone & Special Instructions:** Review and edit the draft to perfectly match the requested `{tone}` and incorporate any `{extra_instructions}`.
    f. **Final Polish:** Read the message one last time. Cut any unnecessary words. Ensure it is flawless and meets all constraints.
    g. **Human Like Messaging:** Ensure the message sounds natural and human-like, avoiding overly formal or robotic language.

    **3. Critical Constraints to Follow:**
    - The 200-character limit is an absolute rule, but it applies **ONLY** when the `{length}` is specifically 'Connection Request'. **Do not apply this limit to 'short', 'medium', or 'long' messages.**
    - **DO NOT** sound like a generic template. The message must feel personal and unique.
    - **DO NOT** include placeholders like `{tone}` in your final output.

    """,
    expected_output="A single block of text representing the final, ready-to-send message, adhering to all constraints.",
    agent=message_writer_agent,
    context=[process_target_profile_task, connection_analysis_task] # Receives the 'EngagementBrief' from the previous task
)



# Create FastAPI router
router = APIRouter()

# Create a POST endpoint to parse and update the USER's data
@router.post("/parse_profile", response_model=LinkedInProfile)
async def parse_linkedin_profile(request: dict, authorization: Optional[str] = Header(None)):
    
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
        os.environ["GEMINI_API_KEY"] = api_key
        # Update the LLM with the provided API key
        profile_llm = LLM(
            model=MODEL_NAME,
            temperature=0.4,
            api_key=api_key
        )
        
        # Create agent with the API key
        linkedin_profile_processor.llm = profile_llm
        process_user_profile_task.agent = linkedin_profile_processor
        process_user_profile_task.async_execution = False
        # Execute the task
        parse_crew = Crew(
            agents=[linkedin_profile_processor],
            tasks=[process_user_profile_task],
            verbose=False    
        )
        result = parse_crew.kickoff(inputs={"user_html": html_content})
        print("Profile parsing completed successfully")
        # print("Raw output:", result.raw)

        # Use regex to extract the JSON object from the raw output
        json_match = re.search(r'\{.*\}', result.raw, re.DOTALL)
        if not json_match:
            # If no '{...}' is found at all, the LLM failed completely.
            raise HTTPException(status_code=500, detail="Failed to find a valid JSON object in the model's response.")
        json_string = json_match.group(0)

        return json.loads(json_string)
        
    except Exception as e:
        print(f"Error parsing profile: {str(e)}")
        raise HTTPException(status_code=503, detail=f"Failed to parse profile: {str(e)}")

# Create a POST endpoint to generate a message based on profile data
@router.post("/generate")
async def generate_message(request: GenerateMessageRequest, authorization: Optional[str] = Header(None)):
    print("Generate message request received")

    api_key = None
    if authorization and authorization.startswith("Bearer "):
        api_key = authorization[7:]  # Remove "Bearer " prefix

    if not api_key or api_key == "null":
        print("No API key provided")
        raise HTTPException(status_code=401, detail="No API key provided in Authorization header")
    
    # TODO: Implement actual message generation logic
    # For now, just return a placeholder response

    if not request.target_html:
        raise HTTPException(status_code=400, detail="target html must be provided. Refresh the page and try again.")
    
    try:
        # Update the LLM with the provided API key
        message_llm = LLM(
            model=MODEL_NAME,
            temperature=0.8,
            api_key=api_key
        )

        # Set up agents with the API key
        linkedin_profile_processor.llm = message_llm
        engagement_strategist.llm = message_llm
        message_writer_agent.llm = message_llm
        process_target_profile_task.agent = linkedin_profile_processor
        connection_analysis_task.agent = engagement_strategist
        write_message_task.agent = message_writer_agent
        process_target_profile_task.async_execution = False

        # Execute the tasks in sequence
        message_crew = Crew(
            agents=[linkedin_profile_processor, engagement_strategist, message_writer_agent],
            tasks=[process_target_profile_task, connection_analysis_task, write_message_task],
            verbose=False    
        )

        result = message_crew.kickoff(inputs={
            "user_data": request.user_data,
            "target_html": request.target_html,
            "tone": request.tone,
            "length": request.length,
            "call_to_action": request.call_to_action,
            "extra_instructions": request.extra_instruction or ""
        })

        print("Message generation completed successfully")

    except Exception as e:
        print(f"Error generating message: {str(e)}")
        raise HTTPException(status_code=503, detail=f"Failed to generate message: {str(e)}")

    return {
        "generated_message": result.raw,
        "status": "success"
    }