import streamlit as st
from app.pipeline import classify_report
from app.models import ReportIn

st.set_page_config(page_title="Civic ML", layout="centered")

st.title("Civic ML Report Classification")

st.write("Submit a civic issue report for ML classification.")

text = st.text_area("Report description")

uploaded_image = st.file_uploader("Upload an image (optional)", type=["jpg", "jpeg", "png"])

if st.button("Submit"):
    if not text.strip():
        st.warning("Please enter a description")
    else:
        report = ReportIn(
            description=text,
            image=None  # image handling stays inside pipeline
        )

        result = classify_report(report.dict())
        st.success(result)
