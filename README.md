# Flaggly

A simple feature flag service built to work on Cloudflare.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/butttons/flaggly)

## Features

- Boolean flags - Plain old `true` or `false`
- Payload flags - Use _any_ payload
- Variant flags - Pick a variant and use it's payload or ID.
- Global kill switch
- Rules matching JEXL.
- Segments to reuse across flags.
