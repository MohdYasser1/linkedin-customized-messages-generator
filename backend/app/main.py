from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from endpoint import router

app = FastAPI(title="LinkedIn Customized Message Generator")

app.include_router(router)
