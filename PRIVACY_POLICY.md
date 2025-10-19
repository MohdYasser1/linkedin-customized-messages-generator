# Privacy Policy

Last updated: 2025-10-20

This Privacy Policy describes how the LinkedIn Customized Messages Generator browser extension (the "Extension") collects, uses, and shares information.

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

- The Extension does not persistently store your API key or page content on our servers beyond what is necessary to process your request. Any server-side transient processing or logging will be minimized and purged within a reasonable period. We do not sell your information.

## Sharing

- We do not share your information with third parties except the backend AI service used to fulfill your requests.

## Security

- We use HTTPS for data in transit. Nevertheless, no method of transmission or storage is 100% secure. Please keep your API key confidential.

## Your Choices

- You can remove or update data in the Options page at any time.
- You can uninstall the Extension to stop all data collection and processing.

## Changes to This Policy

We may update this policy from time to time. We will update the "Last updated" date above and may provide additional notice where required.

## Contact

If you have questions about this policy, please open an issue in the repository or contact the maintainer of this project.
