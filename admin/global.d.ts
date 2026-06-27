export { }

declare global {
  interface CustomJwtSessionClaims {
    metadata: {
      apikey?: string,
    }
  }
}
