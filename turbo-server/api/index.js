/**
 * Vercel Serverless Entry Point — Turbo Layer
 * 
 * Vercel membutuhkan Express app di-export sebagai serverless function.
 * Semua routing logic tetap di server.js — file ini cuma jembatan.
 * 
 * Cara kerja:
 * 1. Vercel route semua request ke sini (via vercel.json)
 * 2. File ini import & export app dari server.js
 * 3. server.js otomatis deteksi Vercel -> skip app.listen()
 */

const app = require('../server');

module.exports = app;
