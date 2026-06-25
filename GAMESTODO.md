# 🗺️ Club Dreadnought - Hoja de Ruta de Juegos (Ordenado por Dificultad de Implementación)

Este documento detalla la cola de desarrollo organizada de menor a mayor complejidad a nivel de código, arquitectura de datos y algoritmos en el backend.

---

## 🟢 Nivel 1: Dificultad Baja & Media-Baja
> Enfoque: Mecánicas base de flujo de cartas, información oculta síncrona y mercados simples.

- **Virus** 🧪
  * **Dificultad:** Baja
  * **Utilidad para el motor:** Alta (Introduce lógica pura de mazo/mano/descarte y targeting directo/interacción entre jugadores).
  * **Mecánicas nuevas:** Gestión clásica de Mazo/Mano/Descarte, interacción y targeting directo entre jugadores (infectar órganos de rivales / curar órganos propios).

- **Draftosaurus** 🦖
  * **Dificultad:** Baja
  * **Utilidad para el motor:** Alta (Obliga al motor a gestionar información oculta simultánea y flujos de traspaso de estado).
  * **Mecánicas nuevas:** Información oculta (manos privadas), draft simultáneo (mecanismo de "paso mi mano al vecino de la izquierda"), dados de restricción de colocación.

- **Waroong Wars** 🍛
  * **Dificultad:** Media-Baja
  * **Utilidad para el motor:** Media (Aporta mecánicas de riesgo controladas por el servidor y gestión de contratos reactivos).
  * **Mecánicas nuevas:** Gestión de puestos de comida, empuje de la suerte (press-your-luck), control de pedidos dinámicos en un mercado de clientes competitivo.

- **Jaipur** 🐫
  * **Dificultad:** Baja-Media
  * **Utilidad para el motor:** Muy Alta (Aporta el concepto de trueque asíncrono y pilas de puntuación decrecientes).
  * **Mecánicas nuevas:** Mercado de trueque (intercambio síncrono de N por N cartas), límite estricto de mano (7 cartas en todo momento), set collection con tokens de puntuación decreciente (las primeras mercancías valen más).
  * **Jugadores:** 2.

---

## 🟡 Nivel 2: Dificultad Media
> Enfoque: Motores de efectos encadenados, movimiento en carrusel y mapas de rutas lineales.

- **Bali** 🗿
  * **Dificultad:** Media
  * **Utilidad para el motor:** Media (Obliga a calcular valores de puntuación basados en pools ocultos/sacrificados acumulados).
  * **Mecánicas nuevas:** Gestión de altar/ofrendas, puntuación dinámica basada en la cantidad de recursos que los jugadores han decidido "sacrificar" a lo largo de la partida.

- **Radlands** ☢️
  * **Dificultad:** Media
  * **Utilidad para el motor:** Alta (Introduce un motor de efectos/combos encadenados y gestión de estados de daño en cartas).
  * **Mecánicas nuevas:** Gestión de campamentos destructibles, coste de activación de habilidades mediante agua (recurso síncrono), sinergias complejas de efectos y combos de cartas en mesa.

- **A Fistful of Meeples** 🤠
  * **Dificultad:** Media
  * **Utilidad para el motor:** Media-Alta (Tu primera interacción con la siembra de trabajadores y movimiento en carrusel sobre layouts lineales).
  * **Mecánicas nuevas:** Colocación de trabajadores dinámica basada en la mecánica de Mancala (recoger trabajadores de una localización e irlos soltando por la calle del salvaje oeste), robos e interacciones en edificios.

- **Concordia** 🏛️
  * **Dificultad:** Media
  * **Utilidad para el motor:** Brutal (Une la construcción de mazos/deckbuilding con la expansión física en un mapa de rutas; ideal para estructurar el motor de producción de redes).
  * **Mecánicas nuevas:** Gestión de mano mediante cartas de personalidad (juegas una carta para hacer la acción y recuperas la mano con el Tribuno), construcción de casas en ciudades conectadas por rutas, mercado de cartas dinámico y puntuación final basada en multiplicar dioses del mazo por provincias controladas.

---

## 🟠 Nivel 3: Dificultad Media-Alta
> Enfoque: Drafts con penalización, colocación incremental, ciclos estacionales, flujos de descarte dinámicos y matrices de puntuación adyacente.

- **Arquitectos del Reino del Oeste** 📐
  * **Dificultad:** Media-Alta
  * **Utilidad para el motor:** Muy Alta (Introduce un sistema de colocación de trabajadores donde el valor de la acción crece de forma acumulativa y un sistema de captura de trabajadores rivales).
  * **Mecánicas nuevas:** Colocación de trabajadores incremental (cuantos más trabajadores tuyos haya en una localización, más potente es la acción), captura de trabajadores (puedes detener y encarcelar los meeples de otros jugadores), track de virtud/corrupción que limita las acciones legales, y construcción del palacio del arzobispo.

- **Saqueadores del Mar del Norte** 🪓
  * **Dificultad:** Media-Alta
  * **Utilidad para el motor:** Alta (Introduce una mecánica de turnos muy fluida de "coloca uno, recoge uno" que rompe el flujo clásico de colocación de trabajadores).
  * **Mecánicas nuevas:** Sistema de "Colocar un trabajador, activar acción, recoger un trabajador de otra zona, activar acción secundaria", gestión de tripulación (fuerza militar), recolección de provisiones/ganado y resolución de incursiones basadas en dados y fuerza total.

- **Viticulture** 🍷
  * **Dificultad:** Media-Alta
  * **Utilidad para el motor:** Alta (Aporta la gestión de flujos temporales/estacionales independientes en un mismo año y envejecimiento de inventario).
  * **Mecánicas nuevas:** Colocación de trabajadores dividida por estaciones (Verano/Invierno), envejecimiento automático de recursos en bodega al final del año (las uvas y vinos aumentan su valor numérico), contratos de pedidos de vino específicos y sistema de trabajadores grandes (Grandes) que saltan los bloqueos de acciones.

- **Heat: Pedal to the Metal** 🏎️
  * **Dificultad:** Media-Alta
  * **Utilidad para el motor:** Muy Alta (Aporta gestión de mazos dinámicos en carrera, gestión de "descarte/basura" en mano con las cartas de estrés/calor, y movimiento en mapa con casillas lineales y cuellos de botella).
  * **Mecánicas nuevas:** Gestión de motor/marchas (decide cuántas cartas robas y juegas), mecánicas de "Calor" (cartas que bloquean tu mano y debes enfriar bajando de marcha o usando símbolos de rebufo), curvas con límite de velocidad estricto (si te pasas de velocidad, pagas con cartas de calor o trompeas) y rebufos automáticos.

- **Azul** 🧱
  * **Dificultad:** Media-Alta
  * **Utilidad para el motor:** Muy Alta (Manejo estricto de drafts compartidos, descarte punitivo y lógicas de adyacencia matricial).
  * **Mecánicas nuevas:** Draft de factorías circulares, gestión de sobrantes (fichas que caen al suelo y penalizan), tablero personal con matriz de colocación de azulejos y puntuación adyacente al final del turno.

- **Explorers of Navoria** 🧭
  * **Dificultad:** Media-Alta
  * **Utilidad para el motor:** Alta (Gestión de dados compartidos como trabajadores y construcción de motores visuales en cascada).
  * **Mecánicas nuevas:** Construcción de motor (tableau building), draft de dados/fichas para activar acciones en un mapa o tablero central de exploración.

---

## 🔴 Nivel 4: Dificultad Alta
> Enfoque: Dependencias espaciales/grafos, triggers de victoria instantánea, sistemas "Follow" y pre-requisitos evolutivos de trabajadores.

- **7 Wonders Duel** ⚔️
  * **Dificultad:** Alta
  * **Utilidad para el motor:** Muy Alta (Perfecto para dominar la dependencia de estados espaciales/solapados y triggers de victoria instantánea).
  * **Mecánicas nuevas:** Estructura de draft espacial (pirámide de cartas solapadas donde solo puedes coger las que están libres de peso), tres condiciones de victoria alternativas instantáneas (militar, científica o puntos por Eras).
  * **Jugadores:** 2.

- **Five Tribes** 🐪
  * **Dificultad:** Alta
  * **Utilidad para el motor:** Alta (Desafío algorítmico puro para validar movimientos válidos de siembra en una matriz bidimensional).
  * **Mecánicas nuevas:** Movimiento continuo de meeples estilo "Mancala" sobre una cuadrícula de losetas, subasta por el orden de turno, activación de acciones según el color del último meeple soltado.

- **Carnegie** 🏢
  * **Dificultad:** Alta
  * **Utilidad para el motor:** Muy Alta (Aporta la lógica de follow/copia de acciones asíncrona de los jugadores y expansión de redes).
  * **Mecánicas nuevas:** Selección de acciones con sistema de "Follow" (el jugador activo elige un departamento y todos los demás ejecutan esa misma acción si tienen trabajadores allí), gestión de departamentos del tablero personal, despliegue de red ferroviaria por EE.UU.

- **Darwin's Journey** 📜
  * **Dificultad:** Alta
  * **Utilidad para el motor:** Alta (Sistemas de pre-requisitos muy complejos para los trabajadores y evolución de tracks interconectados).
  * **Mecánicas nuevas:** Colocación de trabajadores evolucionada (los trabajadores necesitan aprender disciplinas/sellos para poder ejecutar acciones avanzadas), tracking de expedición en islas y sistema de correspondencia.

---

## 💀 Nivel 5: Dificultad Muy Alta
> Enfoque: Heavy Euros Económicos / Simulación Completa de Estado / Grafos y conectividad industrial masiva.

- **Clans of Caledonia** 🧀
  * **Dificultad:** Alta / Muy Alta
  * **Utilidad para el motor:** Máxima (Introduce algoritmos de mercado financiero fluctuante dinámico en base al volumen total de transacciones).
  * **Mecánicas nuevas:** Economía de mercado dinámico (los precios de importación/exportación fluctúan según la oferta y la demanda de los jugadores), control de áreas en mapa hexagonal, contratos de producción y asimetría de clanes.

- **Barrage** 🌊
  * **Dificultad:** Muy Alta
  * **Utilidad para el motor:** Máxima (Gestiona un estado físico tridimensional donde los recursos se mueven solos de forma pasiva por gravedad y tiempos de bloqueo mecánicos).
  * **Mecánicas nuevas:** Gestión de flujos de agua tridimensionales (el agua fluye río abajo por gravedad y las presas la retienen), rueda de construcción asíncrona (los recursos y patentes quedan bloqueados N turnos en una rueda física antes de volver a tu mano).

- **Brass: Birmingham** 🚂
  * **Dificultad:** Muy Alta
  * **Utilidad para el motor:** Máxima (El jefe final. Exige validación estricta de caminos y conectividad lógica de redes para el consumo de recursos compartidos en un grafo industrial complejo).
  * **Mecánicas nuevas:** Gestión de redes de canales y vías de tren conectadas, préstamos bancarios, consumo de carbón y hierro con reglas de conectividad espacial estricta (el carbón viaja por red, el hierro aparece de la nada), el mercado del algodón/bienes.