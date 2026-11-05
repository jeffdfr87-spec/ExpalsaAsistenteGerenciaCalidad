const {onCall}=require('firebase-functions/v2/https');
const {initializeApp}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
initializeApp();
exports.manageFlavorAnalysis=onCall({region:'us-central1',maxInstances:3,timeoutSeconds:60,memory:'256MiB'},require('./flavor').handler(getFirestore()));
