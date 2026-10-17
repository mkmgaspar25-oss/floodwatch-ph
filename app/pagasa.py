"""Reads PAGASA's public National Capital Region page (https://www.pagasa.dost.gov.ph/regional-forecast/ncrprsd).
PAGASA publishes no API for rainfall/thunderstorm warnings, so this parses the public page text.
Safety rules: never invent a warning, never claim "no warning" unless PAGASA's own sentence says so,
and fall back to "could not confirm" when the page layout is not recognised. Text is shown verbatim with a link back."""
import re
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser

PH = timezone(timedelta(hours=8))
URL_NCR = "https://www.pagasa.dost.gov.ph/regional-forecast/ncrprsd"
_END = r"(?=\bSPECIAL FORECAST\b|\bIMPACT BASED FORECAST\b|\bGreater Metro Manila Area Forecast\b|\bRadar Mosaic\b|$)"


class _Text(HTMLParser):
    def __init__(self):
        super().__init__()
        self.out, self.skip = [], 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self.skip += 1
        elif tag in ("br", "p", "div", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6"):
            self.out.append(" ")

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self.skip = max(0, self.skip - 1)

    def handle_data(self, data):
        if not self.skip:
            self.out.append(data)


def parse_ncr(html, now=None):
    now = now or datetime.now(PH)
    p = _Text()
    p.feed(html)
    flat = " ".join("".join(p.out).split())
    if "National Capital Region" not in flat or "Regional Forecast" not in flat:
        raise ValueError("PAGASA page layout not recognised")
    rain_none = re.search(r"no\s+(?:heavy\s+)?rainfall\s+warning\s+(?:is\s+)?issued", flat, re.I) is not None
    m = re.search(r"(Thunderstorm Advisory No\.?\s*\d+.*?)" + _END, flat, re.I)
    ts = None
    if m:
        text = m.group(1).strip()[:1500]
        issued = None
        im = re.search(r"Issued at:\s*(\d{1,2}:\d{2}\s*[AP]M,\s*\d{1,2}\s+\w+\s+\d{4})", text, re.I)
        if im:
            try:
                issued = datetime.strptime(re.sub(r"\s+", " ", im.group(1)), "%I:%M %p, %d %B %Y").replace(tzinfo=PH)
            except ValueError:
                issued = None
        title = re.match(r"Thunderstorm Advisory No\.?\s*\d+", text, re.I).group(0)
        ts = {"title": title, "text": text, "issued_at": issued.isoformat() if issued else None,
              "age_minutes": int((now - issued).total_seconds() // 60) if issued else None}
        ts["possibly_expired"] = ts["age_minutes"] is None or ts["age_minutes"] > 180
    return {"rainfall": {"status": "none" if rain_none else "unknown"}, "thunderstorm": ts}
