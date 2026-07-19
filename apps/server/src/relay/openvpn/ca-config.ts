export function caConfig(directory: string): string {
  return `[ca]
default_ca = relay_ca

[relay_ca]
dir = ${directory}
database = $dir/index.txt
new_certs_dir = $dir/newcerts
certificate = $dir/ca.crt
private_key = $dir/ca.key
serial = $dir/serial
crlnumber = $dir/crlnumber
default_md = sha256
default_days = 3650
default_crl_days = 3650
policy = relay_policy
unique_subject = no
copy_extensions = copy

[relay_policy]
commonName = supplied

[server_cert]
basicConstraints = CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid,issuer

[client_cert]
basicConstraints = CA:FALSE
keyUsage = digitalSignature
extendedKeyUsage = clientAuth
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid,issuer
`;
}
