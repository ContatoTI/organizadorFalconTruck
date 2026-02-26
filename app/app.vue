<template>
  <div>
    <VitePwaManifest />
    <NuxtRouteAnnouncer />
    <NuxtLayout>
      <NuxtPage />
      <PwaInstallPrompt />
    </NuxtLayout>
  </div>
</template>
