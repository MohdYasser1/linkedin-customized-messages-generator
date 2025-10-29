# Privacy Policy

Last updated: 2025-10-30

This Privacy Policy describes how the AI Personalized Message Generator for LinkedIn browser extension (the "Extension") collects, uses, and shares information.

We are not affiliated with or endorsed by LinkedIn.

## Information We Collect

- User-provided profile data: Name, title, about, interests, strengths, and other information you enter in the Options page.
- Page content you process: When you use features like "Generate Message" or "Prefill from LinkedIn", the Extension may collect the main content of the currently open LinkedIn profile page (HTML of the main section) to generate personalized output.
- API key: Your Gemini API key, if provided in Settings.

## How We Use Information

- We use your provided profile data and the LinkedIn page content to generate personalized messages.
- We transmit requests to our backend AI service in order to generate the messages or parse a profile.
- If you provide an API key, it may be transmitted to the backend service strictly for the purpose of fulfilling your request.

## Where Information Is Stored and Processed

- Profile data and settings are stored locally in your browser via Chrome storage APIs.
- When you invoke message generation or profile parsing, the relevant inputs (e.g., LinkedIn page HTML, your profile data, and your API key if required) are sent over HTTPS to the backend AI service at the configured domain to process the request.

## Data Retention

- The Extension does not persistently store your API key or page content on our servers beyond what is necessary to process your request.
- Server-side processing is transient: data is processed in memory and not permanently stored in databases or logs.
- Any temporary logs needed for debugging are automatically purged within 24 hours.
- We do not sell, share with advertisers, or use your data for any purpose other than fulfilling your message generation requests.
- We do not use your data to train AI models or for analytics beyond basic service operation metrics.

## Sharing

- We do not share your information with third parties except our backend AI service (hosted on Hugging Face Spaces) used to fulfill your message generation requests.
- The backend AI service may call Google's Generative Language API (Gemini) using your provided API key to process requests.
- We do not sell your data to advertisers, data brokers, or any other third parties.
- We do not use your data for purposes unrelated to the extension's core functionality (generating personalized LinkedIn message drafts).

## Security

- We use HTTPS for data in transit. Nevertheless, no method of transmission or storage is 100% secure. Please keep your API key confidential.

## Your Choices

- You can remove or update data in the Options page at any time.
- You can use the "Clear All Data" button in the Options page to delete all locally stored extension data.
- You can uninstall the Extension to stop all data collection and processing.
- You have control over what data is sent: the extension only processes data when you explicitly click "Generate Message" or "Prefill from LinkedIn."

## Changes to This Policy

We may update this policy from time to time. We will update the "Last updated" date above and may provide additional notice where required.

## Contact

If you have questions about this policy, please open an issue in the repository or contact the maintainer of this project.
