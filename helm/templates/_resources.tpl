{{/*
Create mapproxy nginx configmap name name as used by the service name label.
*/}}
{{- define "nginx-configmap.fullname" -}}
{{- printf "%s-%s-%s" .Release.Name .Chart.Name "nginx-configmap" | indent 1 }}
{{- end }}

{{- define "configmap.fullname" -}}
{{- $geoserverFullname := include "geoserver.fullname" . }}
{{- printf "%s-configmap" $geoserverFullname | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "route.fullname" -}}
{{- $geoserverFullname := include "geoserver.fullname" . }}
{{- printf "%s-route" $geoserverFullname | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "service.fullname" -}}
{{- $geoserverFullname := include "geoserver.fullname" . }}
{{- printf "%s-service" $geoserverFullname | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "secret.fullname" -}}
{{- $geoserverFullname := include "geoserver.fullname" . }}
{{- printf "%s-secret" $geoserverFullname | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "deployment.fullname" -}}
{{- $geoserverFullname := include "geoserver.fullname" . }}
{{- printf "%s-deployment" $geoserverFullname | trunc 63 | trimSuffix "-" }}
{{- end }}
