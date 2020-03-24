'use strict';

const SERVE_DOCS_PORT = 34567;

module.exports = grunt => {
  grunt.initConfig({
    jsdoc: {
      dist: {
        src: ['lib/**/*.js'],
        options: {
          configure: 'jsdoc.json',
          destination: 'docs',
        },
      },
    },
    connect: {
      server: {
        options: {
          port: SERVE_DOCS_PORT,
          base: 'docs',
          keepalive: true, // Keep the server alive indefinitely
          livereload: true, // Enable live reload (i.c.w. grunt watch)
          open: {
            target: `http://localhost:${SERVE_DOCS_PORT}`, // Open docs in browser automatically
          },
        },
      },
    },
    watch: {
      scripts: {
        files: ['lib/**/*.js'],
        tasks: ['jsdoc'],
        options: {
          spawn: true,
          livereload: true, // Enable live reload (i.c.w. grunt connect)
        },
      },
    },
  });
  grunt.loadNpmTasks('grunt-jsdoc');
  grunt.loadNpmTasks('grunt-contrib-connect');
  grunt.loadNpmTasks('grunt-contrib-watch');
};
