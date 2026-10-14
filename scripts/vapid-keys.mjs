// Prints a fresh VAPID key pair as JSON ({"publicKey": ..., "privateKey": ...}) for `deploy-cloud-run.sh secrets` (ADR 044). Nothing is stored here.
import webpush from 'web-push';

console.log(JSON.stringify(webpush.generateVAPIDKeys()));
