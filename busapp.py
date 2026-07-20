import os
from flask import Flask, render_template, request, jsonify
from whitenoise import WhiteNoise
from services.cuandollega import obtener_arribos

app = Flask(__name__, static_folder="static")
app.wsgi_app = WhiteNoise(app.wsgi_app, root="static/", prefix="static/")


@app.route("/")
def home():
    return render_template("index.html")


@app.route("/api/arribos")
def api_arribos():
    cod_linea = request.args.get("codLinea")
    id_parada = request.args.get("idParada")

    if not cod_linea or not id_parada:
        return jsonify({"error": "Faltan parametros (codLinea, idParada)"}), 400

    data = obtener_arribos(cod_linea, id_parada)
    return jsonify(data)


if __name__ == "__main__":
    app.run(debug=True)