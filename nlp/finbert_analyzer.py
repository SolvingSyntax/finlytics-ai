"""
Offline FinBERT sentiment analysis (NLP mini project).

Runs ProsusAI/finbert locally with Hugging Face Transformers and prints the
sentiment + confidence for each headline, plus an aggregate "market mood".

    pip install transformers torch
    python nlp/finbert_analyzer.py
"""
import re
from transformers import AutoTokenizer, AutoModelForSequenceClassification
import torch

MODEL = "ProsusAI/finbert"
HEADLINES = [
    "Reliance shares slip as broader Indian markets retreat",
    "Reliance stock looks fully priced after a 196% five-year run",
    "Energy stocks under pressure amid global demand concerns",
    "Retail expansion opens a new growth chapter for Reliance",
    "TCS reports strong quarterly profit growth, beats estimates",
]


def preprocess(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def main() -> None:
    tokenizer = AutoTokenizer.from_pretrained(MODEL)
    model = AutoModelForSequenceClassification.from_pretrained(MODEL).eval()
    labels = [model.config.id2label[i].capitalize() for i in range(model.config.num_labels)]

    texts = [preprocess(h) for h in HEADLINES]
    batch = tokenizer(texts, padding=True, truncation=True, max_length=128, return_tensors="pt")
    with torch.no_grad():
        probs = torch.softmax(model(**batch).logits, dim=-1)

    pos_i, neg_i = labels.index("Positive"), labels.index("Negative")
    mood = 0.0
    for text, p in zip(texts, probs):
        idx = int(p.argmax())
        mood += float(p[pos_i] - p[neg_i])
        print(f"{labels[idx]:<9} {p[idx] * 100:5.1f}%  {text}")
    print(f"\nMarket mood (0-100): {round((mood / len(texts) + 1) * 50)}")


if __name__ == "__main__":
    main()
