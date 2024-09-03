// Utility Function
const getNearestDate = (dates) => {
  const now = new Date();
  const validDates = dates.filter((date) => date && date.trim() !== "");

  if (validDates.length === 0) return "";

  const futureDates = validDates.filter((date) => new Date(date) > now);
  const pastDates = validDates.filter((date) => new Date(date) <= now);

  if (futureDates.length > 0) {
    // Return the nearest future date
    return futureDates.reduce((nearest, current) =>
      new Date(current) < new Date(nearest) ? current : nearest
    );
  } else if (pastDates.length > 0) {
    // Return the most recent past date
    return pastDates.reduce((mostRecent, current) =>
      new Date(current) > new Date(mostRecent) ? current : mostRecent
    );
  }

  return "";
};

// API Functions
const performSearch = async (headers, parentId, fieldName, pkey) => {
  const searchBody = JSON.stringify({
    aql: `select id, pkey, title, ${fieldName} from __main__ where parent_id eq ${parentId} AND pkey co "${pkey}"`,
  });

  // console.log(`Performing search for ${pkey} records:`, {
  //   parentId,
  //   fieldName,
  //   pkey,
  //   searchBody,
  // });

  const searchResponse = await fetch(
    `${process.env.ENDPOINT_DOMAIN}/records/search`,
    {
      method: "POST",
      headers,
      body: searchBody,
    }
  );

  if (!searchResponse.ok) {
    const errorBody = await searchResponse.text();
    console.error(`Search request for ${fieldName} failed:`, {
      status: searchResponse.status,
      statusText: searchResponse.statusText,
      errorBody,
    });
    return null;
  }

  const result = await searchResponse.json();
  // console.log(
  //   `Search results for ${pkey} records:`,
  //   JSON.stringify(result, null, 2)
  // );
  return result;
};

const updateParentRecord = async (headers, parentId, attributes) => {
  const updateBody = {
    data: {
      type: "records",
      id: parentId,
      attributes,
    },
  };

  console.log("Updating parent record with body:", JSON.stringify(updateBody));

  const updateResponse = await fetch(
    `${process.env.ENDPOINT_DOMAIN}/records/${parentId}`,
    {
      method: "PATCH",
      headers,
      body: JSON.stringify(updateBody),
    }
  );

  if (!updateResponse.ok) {
    const errorBody = await updateResponse.text();
    throw new Error(
      `Update request failed with status: ${updateResponse.status}, body: ${errorBody}`
    );
  }

  return updateResponse.text();
};

// Main handler
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { parent_id } = JSON.parse(req.body);
    // console.log("Received webhook with parent_id:", parent_id);

    if (!parent_id) {
      return res
        .status(400)
        .json({ message: "No parent_id provided in the webhook event" });
    }

    const headers = {
      Authorization: `Bearer ${process.env.ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    };

    const [maintenanceResult, calibrationResult, requalificationResult] =
      await Promise.allSettled([
        performSearch(headers, parent_id, "cf_next_pm_due_date", "MNT"),
        performSearch(headers, parent_id, "cf_next_calibration_due", "CAL"),
        performSearch(headers, parent_id, "cf_next_requalification", "RQ"),
      ]);

    // console.log("Search results status:", {
    //   maintenance: maintenanceResult.status,
    //   calibration: calibrationResult.status,
    //   requalification: requalificationResult.status,
    // });

    const safelyGetDates = (result, fieldName) =>
      result.status === "fulfilled" && result.value?.data
        ? result.value.data
            .map((item) => item.attributes?.[fieldName])
            .filter(Boolean)
        : [];

    const nearestMaintenanceDate = getNearestDate(
      safelyGetDates(maintenanceResult, "cf_next_pm_due_date")
    );
    const nearestCalibrationDate = getNearestDate(
      safelyGetDates(calibrationResult, "cf_next_calibration_due")
    );
    const nearestRequalificationDate = getNearestDate(
      safelyGetDates(requalificationResult, "cf_next_requalification")
    );

    // console.log("Nearest dates:", {
    //   maintenance: nearestMaintenanceDate,
    //   calibration: nearestCalibrationDate,
    //   requalification: nearestRequalificationDate,
    // });

    const updateFields = {};

    if (nearestMaintenanceDate !== null && nearestMaintenanceDate !== "") {
      updateFields.cf_next_pm_due_date = nearestMaintenanceDate;
    }

    if (nearestCalibrationDate !== null && nearestCalibrationDate !== "") {
      updateFields.cf_next_calibration_due = nearestCalibrationDate;
    }

    if (
      nearestRequalificationDate !== null &&
      nearestRequalificationDate !== ""
    ) {
      updateFields.cf_next_requalification = nearestRequalificationDate;
    }

    const updateResult = await updateParentRecord(
      headers,
      parent_id,
      updateFields
    );

    console.log("Update result:", updateResult);

    res.status(200).json({
      message: "Webhook event processed successfully",
      updatedParentId: parent_id,
      nearestMaintenanceDate,
      nearestCalibrationDate,
      nearestRequalificationDate,
    });
  } catch (error) {
    console.error("Error handling webhook event:", error);
    res
      .status(500)
      .json({ error: "Internal Server Error", details: error.message });
  }
}
