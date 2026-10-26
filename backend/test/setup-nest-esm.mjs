// Nest 12 is ESM; several Nest plugins still require it from CommonJS.
// Finish loading these shared modules before Jest links the test import graph,
// so a plugin does not synchronously require an ESM module still being linked.
import 'reflect-metadata';
import '@nestjs/common';
import '@nestjs/core';
