"""
CMF Tarjetas — Scraper
Descarga el PDF más reciente de tarjetas emitidas desde la CMF,
lo procesa con Claude y guarda el JSON en frontend/src/data/latest.json.
"""

import os
import sys
import json
import base64
import pathlib
import urllib.request
import urllib.error
from html.parser import HTMLParser

PORTAL_URL = "https://www.cmfchile.cl/portal/estadisticas/617/w3-propertyvalue-44670.html"
SCRIPT_DIR = pathlib.Path(__file__).parent
REPO_ROOT = SCRIPT_DIR.parent
LAST_URL_FILE = SCRIPT_DIR / "last_url.txt"
OUTPUT_JSON = REPO_ROOT / "frontend" / "src" / "data" / "latest.json"

PROMPT = (
    'Extrae datos de tarjetas emitidas. Responde SOLO JSON sin markdown: '
    '{"periodo":"string","instituciones":[{"codigo":"string","nombre":"string",'
    '"tipo":"banco"|"cooperativa","debito":number,"credito":number,"prepago":number}]} '
    'Busca tablas de tarjetas emitidas por tipo. Usa 0 si no hay dato. '
    'Incluye TODAS las instituciones.'
)

MODEL = "claude-sonnet-4-20250514"


class PDFLinkParser(HTMLParser):
    """Extrae el primer enlace a PDF en la sección de planillas/informes."""

    def __init__(self):
        super().__init__()
        self.pdf_urls: list[str] = []
        self._in_section = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "a" and "href" in attrs:
            href = attrs["href"]
            if href.lower().endswith(".pdf") or ".pdf" in href.lower():
                self.pdf_urls.append(href)


def fetch_html(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 CMF-Scraper/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="replace")


def find_pdf_url(html: str) -> str | None:
    parser = PDFLinkParser()
    parser.feed(html)
    if not parser.pdf_urls:
        return None
    url = parser.pdf_urls[0]
    if url.startswith("http"):
        return url
    if url.startswith("/"):
        return "https://www.cmfchile.cl" + url
    return "https://www.cmfchile.cl/" + url


def download_pdf(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 CMF-Scraper/1.0"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        return resp.read()


def extract_with_claude(pdf_bytes: bytes, api_key: str) -> dict:
    import urllib.request
    b64 = base64.standard_b64encode(pdf_bytes).decode()
    payload = json.dumps({
        "model": MODEL,
        "max_tokens": 8192,
        "messages": [{
            "role": "user",
            "content": [
                {
                    "type": "document",
                    "source": {
                        "type": "base64",
                        "media_type": "application/pdf",
                        "data": b64,
                    },
                },
                {"type": "text", "text": PROMPT},
            ],
        }],
    }).encode()

    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=payload,
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=300) as resp:
        result = json.loads(resp.read())

    text = result["content"][0]["text"]
    # Strip markdown fences if present
    text = text.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    return json.loads(text)


def main():
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("ERROR: ANTHROPIC_API_KEY no está definida.", file=sys.stderr)
        sys.exit(1)

    print(f"Consultando portal CMF: {PORTAL_URL}")
    try:
        html = fetch_html(PORTAL_URL)
    except Exception as e:
        print(f"ERROR al descargar portal: {e}", file=sys.stderr)
        sys.exit(1)

    pdf_url = find_pdf_url(html)
    if not pdf_url:
        print("ERROR: No se encontró ningún PDF en la página.", file=sys.stderr)
        sys.exit(1)

    print(f"PDF encontrado: {pdf_url}")

    # Comparar con URL anterior
    last_url = LAST_URL_FILE.read_text().strip() if LAST_URL_FILE.exists() else ""
    if pdf_url == last_url:
        print("Sin cambios: la URL del PDF es la misma que la última procesada. Nada que hacer.")
        sys.exit(0)

    print("Nueva URL detectada, descargando PDF…")
    try:
        pdf_bytes = download_pdf(pdf_url)
    except Exception as e:
        print(f"ERROR al descargar PDF: {e}", file=sys.stderr)
        sys.exit(1)

    print(f"PDF descargado ({len(pdf_bytes):,} bytes). Enviando a Claude…")
    try:
        data = extract_with_claude(pdf_bytes, api_key)
    except Exception as e:
        print(f"ERROR al llamar a Claude: {e}", file=sys.stderr)
        sys.exit(1)

    n = len(data.get("instituciones", []))
    print(f"Datos extraídos: periodo={data.get('periodo')}, instituciones={n}")
    if n == 0:
        print("WARNING: Claude no devolvió instituciones. Revisa el prompt o el PDF.", file=sys.stderr)

    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_JSON.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    print(f"JSON guardado en {OUTPUT_JSON}")

    LAST_URL_FILE.write_text(pdf_url)
    print(f"URL guardada en {LAST_URL_FILE}")
    print("Listo.")


if __name__ == "__main__":
    main()
