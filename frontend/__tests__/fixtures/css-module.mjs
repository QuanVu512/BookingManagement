export default new Proxy(
  {},
  {
    get: (_target, property) => (typeof property === 'string' ? property : ''),
  },
);
