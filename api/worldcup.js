export default async function handler(req, res) {
  try {

    const endpoint = req.query.endpoint;

    if (!endpoint) {
      return res.status(400).json({
        error: "endpoint required"
      });
    }

    const url =
      `https://worldcup26.ir/${endpoint}`;

    const response = await fetch(url, {
      headers: {
        Accept: "application/json"
      }
    });

    const text = await response.text();

    res.setHeader(
      "Access-Control-Allow-Origin",
      "*"
    );

    res.status(response.status).send(text);

  } catch (err) {

    res.status(500).json({
      error: err.message
    });

  }
}