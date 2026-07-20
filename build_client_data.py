import json
import os

COLOR_MAP = {
    "LINEA 202": "#EAB308", # amarillo
    "LINEA 202 CARMEN-LP": "#EAB308", # amarillo
    "LINEA 214": "#EF4444", # rojo
    "LINEA 273": "#DC2626", # rojo (asumiendo rojo primario)
    "LINEA 273 S/R TOP-4": "#DC2626", # rojo y azul
    "LINEA 338 (TALP)": "#3B82F6", # azul y blanco
    "LINEA 406 (TALP)": "#3B82F6", # azul y blanco
    "LINEA 418": "#3B82F6", # azul y blanco
    "LINEA 518": "#EAB308", # amarillo
    "LINEA 520": "#EAB308", # amarillo
    "LINEA ESTE": "#EAB308", # amarillo
    "LINEA ESTE 45-46": "#EAB308", # amarillo
    "LINEA NORTE": "#2563EB", # azul
    "LINEA SUR 10": "#22C55E", # verde
    "LINEA SUR 19-21": "#22C55E", # verde
    "UNIVERSITARIO": "#0EA5E9", # celeste
}

def build_client_data():
    with open("paradas_extraidas.json", "r", encoding="utf-8") as f:
        data = json.load(f)

    # Estructura de salida
    client_data = {
        "lineas": {},
        "paradas": {},
        "zonas": set()
    }

    # Procesar paradas
    for id_parada, parada_info in data.items():
        nombre = parada_info["nombre"]
        
        # Extraer zona (último token después de " - ")
        zona = "DESCONOCIDA"
        if " - " in nombre:
            partes = nombre.split(" - ")
            zona = partes[-1].strip()
            # Simplificar nombre de parada (quitar las zonas)
            # Ej: "AVENIDA 7 - LA PLATA y CALLE 45 - LA PLATA" -> "AVENIDA 7 y CALLE 45"
            nombre_limpio = nombre.replace(f" - {zona}", "")
        else:
            nombre_limpio = nombre
            
        client_data["zonas"].add(zona)

        lineas_parada = []
        for l in parada_info["lineas"]:
            cod_linea = l["codigo"]
            nombre_linea = l["nombre"]
            lineas_parada.append(cod_linea)
            
            if cod_linea not in client_data["lineas"]:
                client_data["lineas"][cod_linea] = {
                    "codigo": cod_linea,
                    "nombre": nombre_linea,
                    "color": COLOR_MAP.get(nombre_linea, "#1D4ED8"),
                    "paradas_count": 0
                }
            client_data["lineas"][cod_linea]["paradas_count"] += 1

        client_data["paradas"][id_parada] = {
            "nombre": nombre_limpio,
            "zona": zona,
            "lineas": lineas_parada
        }

    # Convertir dicts a lists donde sea conveniente y ordenar
    client_data["zonas"] = sorted(list(client_data["zonas"]))
    
    # Ordenar lineas alfabeticamente por nombre
    lineas_list = list(client_data["lineas"].values())
    lineas_list.sort(key=lambda x: x["nombre"])
    client_data["lineas"] = lineas_list

    # Crear directorio static/data si no existe
    os.makedirs("static/data", exist_ok=True)
    
    with open("static/data/paradas.json", "w", encoding="utf-8") as f:
        json.dump(client_data, f, ensure_ascii=False, separators=(',', ':')) # minificado
        
    print(f"Data generada en static/data/paradas.json con {len(client_data['paradas'])} paradas y {len(client_data['lineas'])} lineas.")

    # Generar search index optimizado para autocomplete
    search_index = []
    for id_parada, info in client_data["paradas"].items():
        search_index.append({
            "id": id_parada,
            "n": info["nombre"],
            "z": info["zona"],
            "l": info["lineas"]
        })

    with open("static/data/search_index.json", "w", encoding="utf-8") as f:
        json.dump(search_index, f, ensure_ascii=False, separators=(',', ':'))

    print(f"Search index generado en static/data/search_index.json con {len(search_index)} entradas.")

if __name__ == "__main__":
    build_client_data()
