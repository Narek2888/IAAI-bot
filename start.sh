#!/bin/bash
ulimit -u unlimited
exec node backend/index.js
