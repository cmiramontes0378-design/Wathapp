// Configuración de pm2 para tener el bot corriendo 24/7 y que se reinicie solo si se cae.
module.exports = {
  apps: [
    {
      name: 'wathapp',
      script: 'src/bot.js',
      autorestart: true,
      restart_delay: 10000,
      max_restarts: 50,
      max_memory_restart: '800M',
      out_file: 'logs/bot.log',
      error_file: 'logs/errores.log',
      time: true,
    },
  ],
};
