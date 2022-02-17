# Run NodeODM thorugh docker-compose
To easily manage NodeODM with docker-compose take a look at these sample `docker-compose.yml` files

## Quickstart
Edit the `config-default.json` to match your required settings. Make sure you change the value for `token` to secure
your NodeODM instance if you plan on hosting the server publicly

## GPU acceleration
To utilize the GPU acceleration of NVIDA graphics cards run: `docker-compose -f docker-compose.gpu.yml up -d`

## CPU only operation
If there is no GPU acceleration available you can run NodeODM on CPU only with: `docker-compose -f docker-compose.cpu.yml up -d`
