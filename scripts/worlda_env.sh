# World A env loader (source this)

export WORLD_A_ORIGIN="https://world-a.netlify.app"
export WORLD_A_API="https://world-a.netlify.app/api/world"

export AGENT_ID="$(jq -r '.agent_id' /tmp/embassy_certificate.json)"
export CERT_ONE_LINE="$(jq -c '.' /tmp/embassy_certificate.json)"

echo "AGENT_ID=$AGENT_ID"
echo "CERT bytes=$(printf '%s' "$CERT_ONE_LINE" | wc -c | tr -d ' ')"
