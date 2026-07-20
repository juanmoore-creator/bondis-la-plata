import requests
from bs4 import BeautifulSoup


def obtener_arribos(cod_linea: str, id_parada: str) -> dict:
    """Consulta la API de CuandoLlega y retorna los arribos para una línea y parada."""
    session = requests.Session()

    # Paso 1: obtener el token y la cookie actual desde la web
    resp = session.get(
        "https://cuandollega.smartmovepro.net/unionplatense/arribos/",
        params={"codLinea": cod_linea, "idParada": id_parada},
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"
        },
    )
    soup = BeautifulSoup(resp.text, "html.parser")
    token_input = soup.find("input", {"name": "CSRF-TOKEN-CL-FORM"})
    token = token_input["value"] if token_input else None

    # Obtener cookie del response
    cookies = session.cookies.get_dict()
    csrf_cookie = cookies.get("X-CSRF-TOKEN-CL")

    if not token or not csrf_cookie:
        return {"error": "No se pudo obtener token o cookie CSRF"}

    # Paso 2: enviar POST con headers idénticos al navegador
    headers = {
        "Accept": "*/*",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
        "Content-Type": "application/json; charset=utf-8",
        "Origin": "https://cuandollega.smartmovepro.net",
        "Referer": f"https://cuandollega.smartmovepro.net/unionplatense/arribos/?codLinea={cod_linea}&idParada={id_parada}",
        "RequestVerificationToken": token,
        "Cookie": f"X-CSRF-TOKEN-CL={csrf_cookie}",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
        "X-Requested-With": "XMLHttpRequest",
    }

    payload = {"codLinea": cod_linea, "idParada": id_parada}

    r = session.post(
        "https://cuandollega.smartmovepro.net/unionplatense/arribos/",
        params={"codLinea": cod_linea, "idParada": id_parada},
        json=payload,
        headers=headers,
    )

    try:
        return r.json()
    except Exception as e:
        return {
            "error": f"No se pudo decodificar JSON: {e}",
            "status": r.status_code,
            "text": r.text[:400],
        }
