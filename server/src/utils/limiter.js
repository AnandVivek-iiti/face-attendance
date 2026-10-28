const createLimiter = (concurrency) => {
  let active = 0;
  const waiting = [];

  const next = () => {
    if (active >= concurrency || waiting.length === 0) return;
    active += 1;
    const { task, resolve, reject } = waiting.shift();
    Promise.resolve()
      .then(task)
      .then(resolve, reject)
      .finally(() => {
        active -= 1;
        next();
      });
  };

  return (task) =>
    new Promise((resolve, reject) => {
      waiting.push({ task, resolve, reject });
      next();
    });
};

module.exports = { createLimiter };
