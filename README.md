# MOVA AR · Atrapa els cors

Aplicació web de realitat augmentada perquè els residents de la residència **Salus** facin exercicis senzills de mobilitat dels braços davant l'ordinador. Projecte 3 del Projecte Intermodular · **NextByte** (Grup A · Equip 1).

## Com funciona
1. **Menú principal** amb el logotip de MOVA AR i dues opcions: *Començar exercici* i *Instruccions*.
2. **Col·locació**: s'activa la webcam a pantalla completa i es mostra una silueta de referència. L'aplicació comprova que l'usuari té el cap i les espatlles visibles, que està centrat i a la distància correcta. Fins aleshores el botó **COMENÇAR!** està desactivat.
3. **Exercici (30 s)**: apareixen cors a banda i banda del cos, a diferents alçades. L'usuari els ha de tocar amb les mans. Cada cor = 1 punt. La puntuació i el compte enrere es veuen sempre.
4. **Final**: sona un xiulet, es mostra la puntuació final i el botó **FINALITZAR** torna al menú.

## Tecnologies
HTML5, CSS3, JavaScript, [p5.js](https://p5js.org/) 1.11.1 i [ml5.js](https://ml5js.org/) 1.2.1 amb el model **bodyPose** (MoveNet).

## Estructura
```
index.html        Estructura de les tres pantalles (menú, instruccions, exercici)
css/style.css     Estils amb la guia d'estil de MOVA AR
js/sketch.js      Lògica: càmera, bodyPose, col·locació, joc, puntuació i temps
js/sound.js       Sons generats amb la Web Audio API (pop, compte enrere, xiulet)
img/favicon.svg   Icona de la pestanya
```

## Provar-ho en local
La càmera només funciona en `https://` o `localhost`, no obrint el fitxer amb doble clic. Des de la carpeta del projecte:
```
python -m http.server 8000
```
i obriu `http://localhost:8000` amb Chrome o Edge. També es pot fer servir l'extensió *Live Server* de VS Code.

## Publicació a itch.io
Comprimiu el contingut de la carpeta (amb `index.html` a l'arrel del zip), pugeu-lo com a projecte **HTML** i marqueu *This file will be played in the browser*. A *Embed options* activeu el botó de pantalla completa.
