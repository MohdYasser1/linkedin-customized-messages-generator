import json
from http import HTTPStatus

from fastapi import APIRouter
from pydantic import BaseModel, Field
from typing import List
from starlette.responses import Response

from crewai import LLM, Agent, Task

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

llm = LLM(
    model="gemini/gemini-flash-latest",
    temperature=0.7,
)

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
    llm = llm
)

process_user_profile_task = Task(
    description=PARSER_TASK_PROMPT.format(file_content='{user_html}'),
    expected_output="A single, valid JSON object containing the user's complete profile information, matching the schema of the LinkedInProfile model.",
    agent=linkedin_profile_processor,
    output_json=LinkedInProfile,
    verbose=True,
    async_execution=True
)

router = APIRouter()

# Create a POST endpoint to parse and update the USER's data
@router.post("/parse_profile", response_model=LinkedInProfile)
async def parse_linkedin_profile(request: dict):
    print("Request received for profile parsing:", request)
    
    # Extract HTML content from the request
    html_content = request.get("message", "")  # HTML content from LinkedIn profile
    timestamp = request.get("timestamp", "")


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