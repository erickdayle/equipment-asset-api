// Function to get the nearest due date
const getNearestDueDate = (dates) => {
  const validDates = dates.filter((date) => date && date.trim() !== "");
  return validDates.length > 0
    ? validDates.reduce((nearest, current) => {
        return new Date(current) < new Date(nearest) ? current : nearest;
      }, validDates[0])
    : null;
};

// Function to perform a search query
async function performSearch(headers, parentId, fieldName, pkey) {
  const searchBody = JSON.stringify({
    aql: `select id, pkey, title, ${fieldName} from __main__ where parent_id eq ${parentId} AND pkey co "${pkey}"`,
  });

  const searchResponse = await fetch(
    `${process.env.ENDPOINT_DOMAIN}/records/search`,
    {
      method: "POST",
      headers: headers,
      body: searchBody,
    }
  );

  if (!searchResponse.ok) {
    throw new Error(
      `Search request for ${fieldName} failed with status: ${searchResponse.status}`
    );
  }

  return await searchResponse.json();
}

// Function to safely get date from search result
const safelyGetDate = (result, fieldName) => {
  if (result && result.data && Array.isArray(result.data)) {
    return result.data
      .map((item) => item.attributes && item.attributes[fieldName])
      .filter((date) => date && date.trim() !== "");
  }
  return [];
};

export default async function handler(req, res) {
  if (req.method === "POST") {
    let responseBody = {};

    try {
      const { parent_id } = JSON.parse(req.body);

      if (parent_id != null) {
        const headers = {
          Authorization: `Bearer ${process.env.ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        };

        // Perform searches for each type of work order
        const [maintenanceResult, calibrationResult, requalificationResult] =
          await Promise.all([
            performSearch(headers, parent_id, "cf_next_pm_due_date", "MNT"),
            performSearch(headers, parent_id, "cf_next_calibration_due", "CAL"),
            performSearch(headers, parent_id, "cf_next_requalification", "RQ"),
          ]);

        // Process search results
        const nearestMaintenanceDate = getNearestDueDate(
          safelyGetDate(maintenanceResult, "cf_next_pm_due_date")
        );
        const nearestCalibrationDate = getNearestDueDate(
          safelyGetDate(calibrationResult, "cf_next_calibration_due")
        );
        const nearestRequalificationDate = getNearestDueDate(
          safelyGetDate(requalificationResult, "cf_next_requalification")
        );

        // Prepare body for updating parent record
        const updateBody = JSON.stringify({
          cf_next_pm_due_date: nearestMaintenanceDate,
          cf_next_calibration_due: nearestCalibrationDate,
          cf_next_requalification: nearestRequalificationDate,
        });

        // Update parent record
        const updateResponse = await fetch(
          `${process.env.ENDPOINT_DOMAIN}/records/${parent_id}`,
          {
            method: "PATCH",
            headers: headers,
            body: updateBody,
          }
        );

        if (!updateResponse.ok) {
          throw new Error(
            `Update request failed with status: ${updateResponse.status}`
          );
        }

        const updateResult = await updateResponse.text();
        console.log("Update result:", updateResult);

        responseBody = {
          message: "Webhook event processed successfully",
          updatedParentId: parent_id,
          nearestMaintenanceDate,
          nearestCalibrationDate,
          nearestRequalificationDate,
        };
      } else {
        responseBody = {
          message: "No parent_id provided in the webhook event",
        };
      }
    } catch (error) {
      console.error("Error handling webhook event:", error);

      if (error.response) {
        const errorBody = await error.response.text();
        console.error("Error response body:", errorBody);
      }

      res.status(500);
      responseBody = { error: "Internal Server Error" };
    } finally {
      res.json(responseBody);
    }
  } else {
    res.status(405).json({ error: "Method Not Allowed" });
  }
}
