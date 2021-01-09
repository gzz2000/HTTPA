#!/bin/bash

openssl req -newkey rsa:4096 -nodes -keyout key.pem -x509 -days 365 -out certificate.pem

openssl x509 -text -noout -in certificate.pem
