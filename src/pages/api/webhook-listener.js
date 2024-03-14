// Next.js API route support: https://nextjs.org/docs/api-routes/introduction

// export default function handler(req, res) {
//   res.status(200).json({ name: "John Doe" });
// }

// Function to add 1 day to a date string
const addOneDay = (dateString) => {
  const date = new Date(dateString);
  date.setDate(date.getDate() + 1);
  return date.toISOString().replace(/\.\d{3}Z$/, "+00:00");
};

export default async function handler(req, res) {
  if (req.method === "POST") {
    let responseBody = {}; // Initialize an empty object for the response body

    try {
      const {
        parent_id,
        cf_next_pm_due_date,
        cf_next_calibration_due,
        cf_next_requalification,
      } = JSON.parse(req.body);

      if (parent_id != null) {
        const attributes = {};

        if (cf_next_pm_due_date !== undefined && cf_next_pm_due_date !== null) {
          attributes.cf_next_pm_due_date = addOneDay(cf_next_pm_due_date);
        }

        if (
          cf_next_calibration_due !== undefined &&
          cf_next_calibration_due !== null
        ) {
          attributes.cf_next_calibration_due = addOneDay(
            cf_next_calibration_due
          );
        }

        if (
          cf_next_requalification !== undefined &&
          cf_next_requalification !== null
        ) {
          attributes.cf_next_requalification = addOneDay(
            cf_next_requalification
          );
        }

        const body = {
          data: {
            type: "records",
            id: parent_id,
            attributes,
          },
        };

        var myHeaders = new Headers();
        myHeaders.append("Authorization", `Bearer ${process.env.ACCESS_TOKEN}`);
        myHeaders.append("Content-Type", "application/json");

        var requestOptions = {
          method: "PATCH",
          body: JSON.stringify(body),
          headers: myHeaders,
          redirect: "follow",
        };

        const response = await fetch(
          `${process.env.ENDPOINT_DOMAIN}/records/${parent_id}`,
          requestOptions
        );

        if (response.ok) {
          // Request was successful (status code in the range 200-299)
          const result = await response.text();
          console.log(result);
        } else {
          // Request failed, handle the error
          throw new Error(`Request failed with status: ${response.status}`);
        }
      }

      // Populate the response body
      responseBody = {
        message: "Webhook event received successfully",
        body: req.body,
      };
    } catch (error) {
      console.error("Error handling webhook event:", error);

      // Log more details about the error, including the response body
      if (error.response) {
        const responseBody = await error.response.text();
        console.error("Response body:", responseBody);
      }

      res.status(500);
      responseBody = { error: "Internal Server Error" };
    } finally {
      // Send the response, ensuring it is always executed
      res.json(responseBody);
    }
  } else {
    res.status(405).json({ error: "Method Not Allowed" });
  }
}
