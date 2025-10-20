use serde::{
    de::{self, Unexpected, Visitor},
    Deserialize, Deserializer, Serializer,
};
use std::fmt;

pub fn serialize<S>(b: &bool, s: S) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    s.serialize_bool(*b)
}

pub fn deserialize<'de, D>(d: D) -> Result<bool, D::Error>
where
    D: Deserializer<'de>,
{
    struct V;
    impl<'de> Visitor<'de> for V {
        type Value = bool;
        fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
            f.write_str("a bool, 0/1, or \"0\"/\"1\"")
        }
        fn visit_bool<E>(self, v: bool) -> Result<bool, E> { Ok(v) }
        fn visit_u64<E>(self, v: u64) -> Result<bool, E> where E: de::Error { Ok(v != 0) }
        fn visit_i64<E>(self, v: i64) -> Result<bool, E> where E: de::Error { Ok(v != 0) }
        fn visit_str<E>(self, v: &str) -> Result<bool, E>
        where
            E: de::Error,
        {
            match v.trim() {
                "1" | "true" | "True" | "TRUE" => Ok(true),
                "0" | "false" | "False" | "FALSE" => Ok(false),
                other => Err(E::invalid_value(Unexpected::Str(other), &"\"0\"/\"1\" or true/false")),
            }
        }
        fn visit_string<E>(self, v: String) -> Result<bool, E> where E: de::Error {
            self.visit_str(&v)
        }
    }
    d.deserialize_any(V)
}