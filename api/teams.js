export default async function handler(req, res) {
  try {
    const group = req.query.group || "A";

    const response = await fetch(
      `https://worldcup26.ir/get/teams?group=${group}`,
      {
        headers: {
          Accept: "application/json"
        }
      }
    );

    const data = await response.json();

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).json(data);

  } catch (error) {

    res.status(500).json({
      error: error.message
    });

  }
}