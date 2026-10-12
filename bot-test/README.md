# PlayWise — Tickets v3

Le membre clique sur « Créer un ticket », choisit une catégorie, décrit sa demande puis échange avec le support en MP. Les panneaux existants trouvés parmi les 100 derniers messages de chaque salon sont actualisés au démarrage. `/ticketpanel` permet de publier un nouveau panneau.

Catégories : assistance générale, site, Discord, bot, partenariat, signalement, suggestion et autre. Les anciens boutons et les tickets déjà ouverts restent compatibles.

Le staff répond dans le salon privé ; les réponses affichent son pseudo serveur et son rôle le plus haut. Le rôle support peut prendre en charge et fermer un ticket sans permission de modération globale. Le membre peut fermer son propre ticket depuis les MP, avec une raison.

La fermeture archive tous les messages disponibles, puis supprime le salon. Si la lecture ou l’envoi du transcript échoue, le salon reste ouvert. Les opérations d’un même ticket sont sérialisées pour éviter les créations et prises en charge concurrentes. Les sujets et responsables restent stockés dans le sujet du salon Discord, même après redémarrage.

## Configuration existante

- `DISCORD_BOT_TOKEN` : secret du bot, uniquement dans Render.
- `DISCORD_GUILD_ID` : serveur principal ; recommandé et requis si le bot rejoint plusieurs serveurs.
- `TICKET_STAFF_ROLE_ID` : rôle support ; à défaut, détection d’un rôle Staff/Support/Modérateur/Admin.
- `PORT` : fourni par Render.
- `KEEP_ALIVE_ENABLED=false` : désactive l’activité HTTP existante.

Activer Message Content Intent dans le portail Discord. Le bot doit pouvoir gérer les salons, lire les messages et envoyer messages, embeds et fichiers. L’hébergement Render gratuit peut se mettre en veille ; cette refonte ne change pas le forfait.

## Vérification

`npm install` puis `npm test`. Les tests simulent Discord sans token ni envoi réel : ouverture, formulaire, doublons, MP fermés, prise en charge, autorisations, pagination, échec d’archive et fermeture.

## Installation LS Custom depuis un téléphone

Le propriétaire du serveur lance `/backupls`, puis clique sur **Installer LS Custom**. Le bot doit avoir Administrateur pendant l’installation et son rôle doit être au-dessus des autres rôles. La commande ajoute 69 salons, 12 catégories et 16 rôles français. Les éléments existants restent présents et les rôles ne sont pas attribués automatiquement.

Un salon privé supplémentaire conserve le suivi sur Discord pour reprendre avec `/backupls` après une interruption, même après redéploiement. Conservez ce salon. Les collisions avec des rôles/salons inconnus sont bloquées. Une nouvelle commande après installation complète ne crée aucun doublon. Si un élément suivi a été supprimé, la reprise s’arrête pour demander une vérification.

Seul le propriétaire peut confirmer. Les confirmations expirent après cinq minutes et les lancements simultanés sont bloqués. Patron/Co-patron possèdent des droits de gestion ; les administrateurs préexistants ont toujours accès aux salons privés. Les espaces tickets, factures et journaux LS Custom sont manuels ; le système PlayWise de tickets MP existant continue de fonctionner comme avant.

Tests LS Custom : installation, permissions, reprise, collisions, autorisation du propriétaire et confirmation.
