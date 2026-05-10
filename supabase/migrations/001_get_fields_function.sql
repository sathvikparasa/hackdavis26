create or replace function get_fields_in_region(
  min_lat   float,
  max_lat   float,
  min_lon   float,
  max_lon   float,
  lat_delta float default 0.18,
  max_rows  int   default 300
)
returns table(
  unique_id    text,
  main_crop    text,
  county       text,
  acres        float,
  region       text,
  coordinates  json
)
language sql
stable
as $$
  select
    f.unique_id,
    f.main_crop,
    f.county,
    f.acres,
    f.region,
    (ST_AsGeoJSON(
      ST_SimplifyPreserveTopology(
        f.geometry,
        -- more simplification when zoomed out, full detail when zoomed in
        greatest(0.000001, lat_delta * 0.004)
      )
    )::json) -> 'coordinates' as coordinates
  from fields f
  where f.geometry && ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326)
  limit max_rows;
$$;
