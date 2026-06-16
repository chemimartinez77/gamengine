# 🛠️ Comandos Útiles del Proyecto

Este archivo sirve como guía rápida de los comandos de consola más utilizados en este desarrollo.

## 📁 Estructura del Proyecto y Terminal

| Comando | Sistema | ¿Qué hace? |
| :--- | :--- | :--- |
| `tree /f` | Windows | Muestra el árbol gráfico de todas las carpetas y sus archivos (¡ojo! lee todo). |
| `Get-ChildItem -Recurse -Exclude "node_modules", ".git" | Resolve-Path -Relative` | PowerShell | Muestra de forma limpia solo tus archivos del proyecto, ignorando carpetas pesadas. |
| `clear` o `cls` | Ambos | Limpia la pantalla de la terminal para que no esté saturada. |

## 🐙 Control de Versiones (Git)

| Comando | ¿Qué hace? |
| :--- | :--- |
| `git status` | Te dice qué archivos has modificado y cuáles están listos para guardar. |
| `git add .` | Prepara todos los cambios del proyecto para el próximo punto de guardado. |
| `git commit -m "mensaje"` | Guarda de forma definitiva tus cambios en el historial local con un comentario. |
| `git push` | Sube tus puntos de guardado locales a los servidores de GitHub (copia de seguridad). |
| `git log --oneline` | Muestra un historial resumido de tus últimos guardados en una sola línea. |

