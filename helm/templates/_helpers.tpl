{{/*
Expand the name of the chart.
*/}}
{{- define "geoserver.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "geoserver.fullname" -}}
{{- $name := default (include "geoserver.name" . ) .Values.fullnameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "geoserver.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Common labels
*/}}
{{- define "geoserver.labels" -}}
helm.sh/chart: {{ include "geoserver.chart" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/component: backend
environment: {{ include "geoserver.environment" . }}
{{ include "geoserver.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "geoserver.selectorLabels" -}}
app.kubernetes.io/name: {{ include "geoserver.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Returns the environment from global if exists or from the chart's values, defaults to development
*/}}
{{- define "geoserver.environment" -}}
{{- if .Values.global.environment }}
    {{- .Values.global.environment -}}
{{- else -}}
    {{- .Values.environment | default "development" -}}
{{- end -}}
{{- end -}}

{{/*
Returns the cloud provider docker registry url from global if exists or from the chart's values
*/}}
{{- define "geoserver.cloudProviderDockerRegistryUrl" -}}
{{- if .Values.global.cloudProvider.dockerRegistryUrl }}
    {{- printf "%s/" .Values.global.cloudProvider.dockerRegistryUrl -}}
{{- else if .Values.cloudProvider.dockerRegistryUrl -}}
    {{- printf "%s/" .Values.cloudProvider.dockerRegistryUrl -}}
{{- else -}}
{{- end -}}
{{- end -}}

{{- define "geoserver.image" -}}
{{- $registryName := include "geoserver.cloudProviderDockerRegistryUrl" . -}}
{{- $repositoryName := .Values.image.geoserverRepository -}}
{{- $tag := .Values.image.geoserverTag | toString -}}
{{- printf "%s%s:%s" $registryName $repositoryName $tag -}}
{{- end -}}

{{- define "geoserver.sidecarImage" -}}
{{- $registryName := (include "geoserver.cloudProviderDockerRegistryUrl" . ) -}}
{{- $repositoryName := .Values.image.sidecarRepository -}}
{{- $tag := .Values.image.sidecarTag | toString -}}
{{- printf "%s%s:%s" $registryName $repositoryName $tag -}}
{{- end -}}

{{/*
Get the password secret.
*/}}
{{- define "geoserver.secretName" -}}
{{- printf "%s" (include "geoserver.fullname" .) -}}
{{- end -}}